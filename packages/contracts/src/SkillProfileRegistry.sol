// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AgentIdGate} from "./AgentIdGate.sol";
import {IProfileRegistry} from "./interfaces/IProfileRegistry.sol";
import {Keys} from "./lib/Keys.sol";

/// @title SkillProfileRegistry
/// @notice One builder profile per Agent ID holder address. Profile content lives off-chain
///         (metadataURI) and is anchored by `metadataHash` (keccak256 of the canonical JSON).
/// @dev Owner permissions: DEFAULT_ADMIN_ROLE manages roles; PAUSER_ROLE can pause
///      create/update. Admins can NOT edit, transfer or delete anyone's profile.
contract SkillProfileRegistry is AgentIdGate, AccessControl, Pausable, IProfileRegistry {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant MAX_LABEL_LENGTH = 64;

    struct Profile {
        address owner;
        /// @dev uint256(keccak256(bytes(agentLabel))) when a label is bound, else 0.
        uint256 agentIdTokenId;
        /// @dev The `<label>` part of `<label>.ai`, verified on-chain via Agent ID `ownerOf`.
        string agentLabel;
        string metadataURI;
        bytes32 metadataHash;
        uint32 version;
        uint64 createdAt;
        uint64 updatedAt;
        uint64 createdBlock;
        uint64 updatedBlock;
    }

    uint256 public profileCount;
    mapping(uint256 profileId => Profile) private _profiles;
    /// @inheritdoc IProfileRegistry
    mapping(address account => uint256 profileId) public profileOf;
    mapping(uint256 agentIdTokenId => uint256 profileId) public profileOfAgentId;

    event ProfileCreated(
        uint256 indexed profileId,
        address indexed owner,
        uint256 indexed agentIdTokenId,
        string agentLabel,
        string metadataURI,
        bytes32 metadataHash
    );
    event ProfileMetadataUpdated(
        uint256 indexed profileId, address indexed owner, string metadataURI, bytes32 metadataHash, uint32 version
    );
    event AgentLabelBound(uint256 indexed profileId, address indexed owner, uint256 indexed agentIdTokenId, string agentLabel);

    error ProfileAlreadyExists(address account, uint256 profileId);
    error NoProfile(address account);
    error ProfileNotFound(uint256 profileId);
    error InvalidAgentLabel();
    error AgentLabelNotOwned(string agentLabel, address account);
    error AgentIdAlreadyBound(uint256 agentIdTokenId, uint256 profileId);
    error LabelAlreadyBound(uint256 profileId);

    constructor(address agentId_, address admin) AgentIdGate(agentId_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Writes (Agent ID gated)
    // ---------------------------------------------------------------------

    /// @notice Create the caller's profile.
    /// @param agentLabel Optional `<label>` of the caller's `<label>.ai` Agent ID. When non-empty,
    ///        the contract checks `agentId.ownerOf(uint256(keccak256(label))) == msg.sender`.
    function createProfile(string calldata agentLabel, string calldata metadataURI, bytes32 metadataHash)
        external
        whenNotPaused
        onlyAgentIdHolder
        returns (uint256 profileId)
    {
        uint256 existing = profileOf[msg.sender];
        if (existing != 0) revert ProfileAlreadyExists(msg.sender, existing);
        Keys.requireURI(metadataURI);
        Keys.requireHash(metadataHash);

        profileId = ++profileCount;
        Profile storage p = _profiles[profileId];
        p.owner = msg.sender;
        p.metadataURI = metadataURI;
        p.metadataHash = metadataHash;
        p.version = 1;
        p.createdAt = uint64(block.timestamp);
        p.updatedAt = uint64(block.timestamp);
        p.createdBlock = uint64(block.number);
        p.updatedBlock = uint64(block.number);
        profileOf[msg.sender] = profileId;

        uint256 tokenId;
        if (bytes(agentLabel).length != 0) {
            tokenId = _bindLabel(profileId, agentLabel);
        }
        emit ProfileCreated(profileId, msg.sender, tokenId, agentLabel, metadataURI, metadataHash);
    }

    /// @notice Replace the caller's profile metadata reference. Every update bumps `version`
    ///         and is visible in event history.
    function updateProfile(string calldata metadataURI, bytes32 metadataHash) external whenNotPaused onlyAgentIdHolder {
        uint256 profileId = profileOf[msg.sender];
        if (profileId == 0) revert NoProfile(msg.sender);
        Keys.requireURI(metadataURI);
        Keys.requireHash(metadataHash);

        Profile storage p = _profiles[profileId];
        p.metadataURI = metadataURI;
        p.metadataHash = metadataHash;
        p.version += 1;
        p.updatedAt = uint64(block.timestamp);
        p.updatedBlock = uint64(block.number);
        emit ProfileMetadataUpdated(profileId, msg.sender, metadataURI, metadataHash, p.version);
    }

    /// @notice Bind a `<label>.ai` Agent ID to a profile created without one. One-time only.
    function bindAgentLabel(string calldata agentLabel) external whenNotPaused onlyAgentIdHolder {
        uint256 profileId = profileOf[msg.sender];
        if (profileId == 0) revert NoProfile(msg.sender);
        if (_profiles[profileId].agentIdTokenId != 0) revert LabelAlreadyBound(profileId);
        uint256 tokenId = _bindLabel(profileId, agentLabel);
        emit AgentLabelBound(profileId, msg.sender, tokenId, agentLabel);
    }

    function _bindLabel(uint256 profileId, string calldata agentLabel) private returns (uint256 tokenId) {
        uint256 len = bytes(agentLabel).length;
        if (len == 0 || len > MAX_LABEL_LENGTH) revert InvalidAgentLabel();
        tokenId = uint256(keccak256(bytes(agentLabel)));
        address owner;
        try agentId.ownerOf(tokenId) returns (address o) {
            owner = o;
        } catch {
            owner = address(0);
        }
        if (owner != msg.sender) revert AgentLabelNotOwned(agentLabel, msg.sender);
        uint256 boundTo = profileOfAgentId[tokenId];
        if (boundTo != 0) revert AgentIdAlreadyBound(tokenId, boundTo);
        profileOfAgentId[tokenId] = profileId;
        Profile storage p = _profiles[profileId];
        p.agentIdTokenId = tokenId;
        p.agentLabel = agentLabel;
    }

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getProfile(uint256 profileId) external view returns (Profile memory) {
        Profile memory p = _profiles[profileId];
        if (p.owner == address(0)) revert ProfileNotFound(profileId);
        return p;
    }

    /// @inheritdoc IProfileRegistry
    function ownerOfProfile(uint256 profileId) external view returns (address) {
        return _profiles[profileId].owner;
    }

    /// @notice Paginated profile listing, ids `offset+1 .. offset+limit`.
    function getProfiles(uint256 offset, uint256 limit) external view returns (Profile[] memory out) {
        uint256 total = profileCount;
        if (offset >= total) return new Profile[](0);
        uint256 end = offset + limit > total ? total : offset + limit;
        out = new Profile[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            out[i - offset] = _profiles[i + 1];
        }
    }
}

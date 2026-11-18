// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AgentIdGate} from "./AgentIdGate.sol";
import {IProfileRegistry} from "./interfaces/IProfileRegistry.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {Keys} from "./lib/Keys.sol";

/// @title SkillAttestation
/// @notice Peer attestations: an Agent ID holder signs that a builder demonstrated `skillKey`
///         on a specific project. An attestation proves WHO signed the statement, not that the
///         statement is true.
/// @dev Rules: issuer must hold an Agent ID; no self-attestation; at most one ACTIVE attestation
///      per (issuer, subjectProfileId, projectId, skillKey). Revocation keeps the record.
///      Owner permissions: DEFAULT_ADMIN_ROLE manages roles; PAUSER_ROLE can pause new
///      attestations. Admins cannot issue, edit or revoke attestations.
contract SkillAttestation is AgentIdGate, AccessControl, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct Attestation {
        address issuer;
        uint256 subjectProfileId;
        uint256 projectId;
        bytes32 skillKey;
        /// @dev keccak256 of the canonical attestation note JSON (relationship, comment); may be 0.
        bytes32 metadataHash;
        bool revoked;
        uint64 issuedAt;
        uint64 issuedBlock;
        uint64 revokedAt;
        uint64 revokedBlock;
    }

    IProfileRegistry public immutable profiles;
    IProjectRegistry public immutable projects;

    uint256 public attestationCount;
    mapping(uint256 attestationId => Attestation) private _attestations;
    /// @notice key(issuer, subject, project, skill) => currently active attestation id (0 = none)
    mapping(bytes32 key => uint256 attestationId) public activeAttestationByKey;
    mapping(uint256 profileId => uint256[]) private _received;
    mapping(address issuer => uint256[]) private _issued;

    event AttestationIssued(
        uint256 indexed attestationId,
        address indexed issuer,
        uint256 indexed subjectProfileId,
        uint256 projectId,
        bytes32 skillKey,
        bytes32 metadataHash
    );
    event AttestationRevoked(uint256 indexed attestationId, address indexed issuer, uint256 indexed subjectProfileId);

    error ProfileNotFound(uint256 profileId);
    error SelfAttestation();
    error ProjectNotActiveForProfile(uint256 projectId, uint256 profileId);
    error DuplicateActiveAttestation(uint256 existingAttestationId);
    error AttestationNotFound(uint256 attestationId);
    error NotIssuer(uint256 attestationId, address account);
    error AlreadyRevoked(uint256 attestationId);

    constructor(address agentId_, address profiles_, address projects_, address admin) AgentIdGate(agentId_) {
        profiles = IProfileRegistry(profiles_);
        projects = IProjectRegistry(projects_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function attestationKey(address issuer, uint256 subjectProfileId, uint256 projectId, bytes32 skillKey)
        public
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(issuer, subjectProfileId, projectId, skillKey));
    }

    function attest(uint256 subjectProfileId, uint256 projectId, bytes32 skillKey, bytes32 metadataHash)
        external
        whenNotPaused
        onlyAgentIdHolder
        returns (uint256 attestationId)
    {
        address subjectOwner = profiles.ownerOfProfile(subjectProfileId);
        if (subjectOwner == address(0)) revert ProfileNotFound(subjectProfileId);
        if (subjectOwner == msg.sender) revert SelfAttestation();
        (uint256 projectProfile, bool active) = projects.projectStatus(projectId);
        if (projectProfile != subjectProfileId || !active) {
            revert ProjectNotActiveForProfile(projectId, subjectProfileId);
        }
        Keys.requireKey(skillKey);

        bytes32 key = attestationKey(msg.sender, subjectProfileId, projectId, skillKey);
        uint256 existing = activeAttestationByKey[key];
        if (existing != 0) revert DuplicateActiveAttestation(existing);

        attestationId = ++attestationCount;
        _attestations[attestationId] = Attestation({
            issuer: msg.sender,
            subjectProfileId: subjectProfileId,
            projectId: projectId,
            skillKey: skillKey,
            metadataHash: metadataHash,
            revoked: false,
            issuedAt: uint64(block.timestamp),
            issuedBlock: uint64(block.number),
            revokedAt: 0,
            revokedBlock: 0
        });
        activeAttestationByKey[key] = attestationId;
        _received[subjectProfileId].push(attestationId);
        _issued[msg.sender].push(attestationId);
        emit AttestationIssued(attestationId, msg.sender, subjectProfileId, projectId, skillKey, metadataHash);
    }

    /// @notice Issuer withdraws their attestation. Works while paused and without an Agent ID
    ///         check so signers can always retract.
    function revokeAttestation(uint256 attestationId) external {
        Attestation storage a = _attestations[attestationId];
        if (a.issuer == address(0)) revert AttestationNotFound(attestationId);
        if (a.issuer != msg.sender) revert NotIssuer(attestationId, msg.sender);
        if (a.revoked) revert AlreadyRevoked(attestationId);
        a.revoked = true;
        a.revokedAt = uint64(block.timestamp);
        a.revokedBlock = uint64(block.number);
        delete activeAttestationByKey[attestationKey(a.issuer, a.subjectProfileId, a.projectId, a.skillKey)];
        emit AttestationRevoked(attestationId, msg.sender, a.subjectProfileId);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getAttestation(uint256 attestationId) public view returns (Attestation memory a) {
        a = _attestations[attestationId];
        if (a.issuer == address(0)) revert AttestationNotFound(attestationId);
    }

    function isActive(uint256 attestationId) external view returns (bool) {
        Attestation storage a = _attestations[attestationId];
        return a.issuer != address(0) && !a.revoked;
    }

    function receivedCount(uint256 profileId) external view returns (uint256) {
        return _received[profileId].length;
    }

    function issuedCount(address issuer) external view returns (uint256) {
        return _issued[issuer].length;
    }

    /// @notice Paginated attestations received by a profile (including revoked ones).
    function getReceived(uint256 profileId, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Attestation[] memory items)
    {
        return _page(_received[profileId], offset, limit);
    }

    /// @notice Paginated attestations signed by `issuer` (including revoked ones).
    function getIssued(address issuer, uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory ids, Attestation[] memory items)
    {
        return _page(_issued[issuer], offset, limit);
    }

    function _page(uint256[] storage list, uint256 offset, uint256 limit)
        private
        view
        returns (uint256[] memory ids, Attestation[] memory items)
    {
        uint256 total = list.length;
        if (offset >= total) return (new uint256[](0), new Attestation[](0));
        uint256 end = offset + limit > total ? total : offset + limit;
        ids = new uint256[](end - offset);
        items = new Attestation[](end - offset);
        for (uint256 i = offset; i < end; ++i) {
            ids[i - offset] = list[i];
            items[i - offset] = _attestations[list[i]];
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {IProfileRegistry} from "./interfaces/IProfileRegistry.sol";
import {Keys} from "./lib/Keys.sol";

/// @title CredentialRegistry
/// @notice Credentials issued by admin-approved organizations to builder profiles.
///         A credential proves issuance by an approved issuer, not factual infallibility.
/// @dev Owner permissions (document for reviewers):
///      - DEFAULT_ADMIN_ROLE: approve/remove issuers (`setIssuer`), manage roles, and revoke any
///        credential as governance (recorded as `revokedBy`).
///      - PAUSER_ROLE: pause new issuance. Revocation keeps working while paused.
///      - ISSUER_ROLE: issue credentials and revoke the ones it issued.
///      Issuers are organizations and are NOT required to hold an Agent ID; subjects must have a
///      SkillProof profile (which itself required an Agent ID).
contract CredentialRegistry is AccessControl, Pausable {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    uint256 public constant MAX_NAME_LENGTH = 64;

    enum CredentialStatus {
        None,
        Valid,
        Revoked,
        Expired,
        IssuerInactive
    }

    struct Issuer {
        string name;
        string metadataURI;
        bool active;
        uint64 approvedAt;
        uint64 removedAt;
    }

    struct Credential {
        address issuer;
        uint256 subjectProfileId;
        bytes32 credentialType;
        string metadataURI;
        bytes32 metadataHash;
        uint64 issuedAt;
        uint64 issuedBlock;
        /// @dev 0 = never expires
        uint64 expiresAt;
        bool revoked;
        address revokedBy;
        uint64 revokedAt;
        uint64 revokedBlock;
    }

    IProfileRegistry public immutable profiles;
    uint256 public credentialCount;
    mapping(uint256 credentialId => Credential) private _credentials;
    mapping(uint256 profileId => uint256[]) private _credentialsOf;
    mapping(address issuer => uint256[]) private _issuedBy;
    mapping(address issuer => Issuer) private _issuers;
    address[] private _issuerList;
    mapping(address issuer => bool) private _everListed;

    event IssuerApproved(address indexed issuer, string name, string metadataURI);
    event IssuerRemoved(address indexed issuer);
    event CredentialIssued(
        uint256 indexed credentialId,
        address indexed issuer,
        uint256 indexed subjectProfileId,
        bytes32 credentialType,
        string metadataURI,
        bytes32 metadataHash,
        uint64 expiresAt
    );
    event CredentialRevoked(uint256 indexed credentialId, address indexed revokedBy, uint256 indexed subjectProfileId);

    error InvalidIssuer();
    error InvalidName();
    error ProfileNotFound(uint256 profileId);
    error SelfIssuance();
    error InvalidExpiry(uint64 expiresAt);
    error CredentialNotFound(uint256 credentialId);
    error NotAuthorizedToRevoke(uint256 credentialId, address account);
    error AlreadyRevoked(uint256 credentialId);
    error UseSetIssuer();

    constructor(address profiles_, address admin) {
        profiles = IProfileRegistry(profiles_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Issuer allowlist (admin)
    // ---------------------------------------------------------------------

    /// @notice Approve or remove an organization issuer. Name/URI are public labels.
    function setIssuer(address issuer, bool approved, string calldata name, string calldata metadataURI)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (issuer == address(0)) revert InvalidIssuer();
        Issuer storage info = _issuers[issuer];
        if (approved) {
            uint256 nameLen = bytes(name).length;
            if (nameLen == 0 || nameLen > MAX_NAME_LENGTH) revert InvalidName();
            if (bytes(metadataURI).length > Keys.MAX_URI_LENGTH) revert Keys.InvalidURI();
            info.name = name;
            info.metadataURI = metadataURI;
            info.active = true;
            info.approvedAt = uint64(block.timestamp);
            info.removedAt = 0;
            if (!_everListed[issuer]) {
                _everListed[issuer] = true;
                _issuerList.push(issuer);
            }
            super._grantRole(ISSUER_ROLE, issuer);
            emit IssuerApproved(issuer, name, metadataURI);
        } else {
            info.active = false;
            info.removedAt = uint64(block.timestamp);
            super._revokeRole(ISSUER_ROLE, issuer);
            emit IssuerRemoved(issuer);
        }
    }

    /// @dev Force ISSUER_ROLE changes through `setIssuer` so issuer records stay consistent.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == ISSUER_ROLE) revert UseSetIssuer();
        return super._grantRole(role, account);
    }

    function _revokeRole(bytes32 role, address account) internal override returns (bool) {
        if (role == ISSUER_ROLE) revert UseSetIssuer();
        return super._revokeRole(role, account);
    }

    // ---------------------------------------------------------------------
    // Credentials
    // ---------------------------------------------------------------------

    function issueCredential(
        uint256 subjectProfileId,
        bytes32 credentialType,
        string calldata metadataURI,
        bytes32 metadataHash,
        uint64 expiresAt
    ) external whenNotPaused onlyRole(ISSUER_ROLE) returns (uint256 credentialId) {
        address subjectOwner = profiles.ownerOfProfile(subjectProfileId);
        if (subjectOwner == address(0)) revert ProfileNotFound(subjectProfileId);
        if (subjectOwner == msg.sender) revert SelfIssuance();
        Keys.requireKey(credentialType);
        Keys.requireURI(metadataURI);
        Keys.requireHash(metadataHash);
        if (expiresAt != 0 && expiresAt <= block.timestamp) revert InvalidExpiry(expiresAt);

        credentialId = ++credentialCount;
        Credential storage c = _credentials[credentialId];
        c.issuer = msg.sender;
        c.subjectProfileId = subjectProfileId;
        c.credentialType = credentialType;
        c.metadataURI = metadataURI;
        c.metadataHash = metadataHash;
        c.issuedAt = uint64(block.timestamp);
        c.issuedBlock = uint64(block.number);
        c.expiresAt = expiresAt;
        _credentialsOf[subjectProfileId].push(credentialId);
        _issuedBy[msg.sender].push(credentialId);
        emit CredentialIssued(
            credentialId, msg.sender, subjectProfileId, credentialType, metadataURI, metadataHash, expiresAt
        );
    }

    /// @notice Revoke by the original issuer (even after removal from the allowlist) or by governance.
    function revokeCredential(uint256 credentialId) external {
        Credential storage c = _credentials[credentialId];
        if (c.issuer == address(0)) revert CredentialNotFound(credentialId);
        if (msg.sender != c.issuer && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotAuthorizedToRevoke(credentialId, msg.sender);
        }
        if (c.revoked) revert AlreadyRevoked(credentialId);
        c.revoked = true;
        c.revokedBy = msg.sender;
        c.revokedAt = uint64(block.timestamp);
        c.revokedBlock = uint64(block.number);
        emit CredentialRevoked(credentialId, msg.sender, c.subjectProfileId);
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

    /// @notice Status precedence: Revoked > Expired > IssuerInactive > Valid.
    function credentialStatus(uint256 credentialId) public view returns (CredentialStatus) {
        Credential storage c = _credentials[credentialId];
        if (c.issuer == address(0)) return CredentialStatus.None;
        if (c.revoked) return CredentialStatus.Revoked;
        if (c.expiresAt != 0 && c.expiresAt <= block.timestamp) return CredentialStatus.Expired;
        if (!hasRole(ISSUER_ROLE, c.issuer)) return CredentialStatus.IssuerInactive;
        return CredentialStatus.Valid;
    }

    function verifyCredential(uint256 credentialId)
        external
        view
        returns (bool valid, CredentialStatus status, Credential memory credential, Issuer memory issuer)
    {
        credential = _credentials[credentialId];
        if (credential.issuer == address(0)) revert CredentialNotFound(credentialId);
        status = credentialStatus(credentialId);
        valid = status == CredentialStatus.Valid;
        issuer = _issuers[credential.issuer];
    }

    function getCredential(uint256 credentialId) external view returns (Credential memory c) {
        c = _credentials[credentialId];
        if (c.issuer == address(0)) revert CredentialNotFound(credentialId);
    }

    function credentialIdsOf(uint256 profileId) external view returns (uint256[] memory) {
        return _credentialsOf[profileId];
    }

    function credentialIdsIssuedBy(address issuer) external view returns (uint256[] memory) {
        return _issuedBy[issuer];
    }

    function getIssuer(address issuer) external view returns (Issuer memory) {
        return _issuers[issuer];
    }

    function isIssuer(address account) external view returns (bool) {
        return hasRole(ISSUER_ROLE, account);
    }

    /// @notice Every address that was ever approved, including removed ones.
    function getIssuers() external view returns (address[] memory addrs, Issuer[] memory infos) {
        addrs = _issuerList;
        infos = new Issuer[](addrs.length);
        for (uint256 i; i < addrs.length; ++i) {
            infos[i] = _issuers[addrs[i]];
        }
    }
}

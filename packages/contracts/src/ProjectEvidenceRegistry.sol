// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {AgentIdGate} from "./AgentIdGate.sol";
import {IProfileRegistry} from "./interfaces/IProfileRegistry.sol";
import {IProjectRegistry} from "./interfaces/IProjectRegistry.sol";
import {Keys} from "./lib/Keys.sol";

/// @title ProjectEvidenceRegistry
/// @notice Self-reported project evidence anchored on-chain. Records are never edited in place:
///         a revision creates a new record (`supersedeProject`) and the old one stays visible.
/// @dev Owner permissions: DEFAULT_ADMIN_ROLE manages roles; PAUSER_ROLE can pause add/supersede.
///      Revocation by the creator always works, even while paused. Admins cannot alter projects.
contract ProjectEvidenceRegistry is AgentIdGate, AccessControl, Pausable, IProjectRegistry {
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    uint256 public constant MAX_PROJECTS_PER_PROFILE = 200;

    enum ProjectStatus {
        None,
        Active,
        Superseded,
        Revoked
    }

    struct Project {
        uint256 profileId;
        address creator;
        string metadataURI;
        /// @dev keccak256 of the canonical evidence JSON; bound to this record forever.
        bytes32 evidenceHash;
        ProjectStatus status;
        uint256 supersedes;
        uint256 supersededBy;
        uint64 createdAt;
        uint64 createdBlock;
        uint64 closedAt;
        uint64 closedBlock;
    }

    IProfileRegistry public immutable profiles;
    uint256 public projectCount;
    mapping(uint256 projectId => Project) private _projects;
    mapping(uint256 profileId => uint256[]) private _projectsOf;

    event ProjectAdded(
        uint256 indexed projectId, uint256 indexed profileId, address indexed creator, string metadataURI, bytes32 evidenceHash
    );
    event ProjectSuperseded(uint256 indexed oldProjectId, uint256 indexed newProjectId, uint256 indexed profileId);
    event ProjectRevoked(uint256 indexed projectId, uint256 indexed profileId, address indexed creator);

    error NotProfileOwner(uint256 profileId, address account);
    error ProjectNotFound(uint256 projectId);
    error ProjectNotActive(uint256 projectId);
    error NotProjectCreator(uint256 projectId, address account);
    error TooManyProjects(uint256 profileId);

    constructor(address agentId_, address profiles_, address admin) AgentIdGate(agentId_) {
        profiles = IProfileRegistry(profiles_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function addProject(uint256 profileId, string calldata metadataURI, bytes32 evidenceHash)
        external
        whenNotPaused
        onlyAgentIdHolder
        returns (uint256 projectId)
    {
        if (profiles.ownerOfProfile(profileId) != msg.sender) revert NotProfileOwner(profileId, msg.sender);
        projectId = _create(profileId, metadataURI, evidenceHash, 0);
    }

    /// @notice Publish a revision of an active project. The old record becomes `Superseded`
    ///         and links forward to the new one; its evidence hash is never overwritten.
    function supersedeProject(uint256 oldProjectId, string calldata metadataURI, bytes32 evidenceHash)
        external
        whenNotPaused
        onlyAgentIdHolder
        returns (uint256 newProjectId)
    {
        Project storage old = _projects[oldProjectId];
        if (old.status == ProjectStatus.None) revert ProjectNotFound(oldProjectId);
        if (old.creator != msg.sender) revert NotProjectCreator(oldProjectId, msg.sender);
        if (old.status != ProjectStatus.Active) revert ProjectNotActive(oldProjectId);

        newProjectId = _create(old.profileId, metadataURI, evidenceHash, oldProjectId);
        old.status = ProjectStatus.Superseded;
        old.supersededBy = newProjectId;
        old.closedAt = uint64(block.timestamp);
        old.closedBlock = uint64(block.number);
        emit ProjectSuperseded(oldProjectId, newProjectId, old.profileId);
    }

    /// @notice Withdraw a project. Allowed while paused and without an Agent ID check so a
    ///         creator can always retract their own claim.
    function revokeProject(uint256 projectId) external {
        Project storage p = _projects[projectId];
        if (p.status == ProjectStatus.None) revert ProjectNotFound(projectId);
        if (p.creator != msg.sender) revert NotProjectCreator(projectId, msg.sender);
        if (p.status != ProjectStatus.Active) revert ProjectNotActive(projectId);
        p.status = ProjectStatus.Revoked;
        p.closedAt = uint64(block.timestamp);
        p.closedBlock = uint64(block.number);
        emit ProjectRevoked(projectId, p.profileId, msg.sender);
    }

    function _create(uint256 profileId, string calldata metadataURI, bytes32 evidenceHash, uint256 supersedes)
        private
        returns (uint256 projectId)
    {
        Keys.requireURI(metadataURI);
        Keys.requireHash(evidenceHash);
        uint256[] storage list = _projectsOf[profileId];
        if (list.length >= MAX_PROJECTS_PER_PROFILE) revert TooManyProjects(profileId);

        projectId = ++projectCount;
        Project storage p = _projects[projectId];
        p.profileId = profileId;
        p.creator = msg.sender;
        p.metadataURI = metadataURI;
        p.evidenceHash = evidenceHash;
        p.status = ProjectStatus.Active;
        p.supersedes = supersedes;
        p.createdAt = uint64(block.timestamp);
        p.createdBlock = uint64(block.number);
        list.push(projectId);
        emit ProjectAdded(projectId, profileId, msg.sender, metadataURI, evidenceHash);
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

    function getProject(uint256 projectId) external view returns (Project memory p) {
        p = _projects[projectId];
        if (p.status == ProjectStatus.None) revert ProjectNotFound(projectId);
    }

    function isActive(uint256 projectId) external view returns (bool) {
        return _projects[projectId].status == ProjectStatus.Active;
    }

    /// @inheritdoc IProjectRegistry
    function projectStatus(uint256 projectId) external view returns (uint256 profileId, bool active) {
        Project storage p = _projects[projectId];
        return (p.profileId, p.status == ProjectStatus.Active);
    }

    /// @notice All project ids (any status) ever recorded for a profile, oldest first.
    function projectIdsOf(uint256 profileId) external view returns (uint256[] memory) {
        return _projectsOf[profileId];
    }

    function getProjectsOf(uint256 profileId) external view returns (uint256[] memory ids, Project[] memory items) {
        ids = _projectsOf[profileId];
        items = new Project[](ids.length);
        for (uint256 i; i < ids.length; ++i) {
            items[i] = _projects[ids[i]];
        }
    }
}

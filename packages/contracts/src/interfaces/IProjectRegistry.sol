// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProjectRegistry {
    /// @return profileId owning profile (0 if the project does not exist)
    /// @return active true when the project is neither superseded nor revoked
    function projectStatus(uint256 projectId) external view returns (uint256 profileId, bool active);
}

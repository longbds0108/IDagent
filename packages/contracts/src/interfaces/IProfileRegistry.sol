// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IProfileRegistry {
    function ownerOfProfile(uint256 profileId) external view returns (address);
    function profileOf(address account) external view returns (uint256);
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal read-only view of the official Agent ID contract on BNB Smart Chain.
/// @dev Verified on chain 56 at 0x60b9262456de011f7d15a54cdd8c48baaa8b022f
///      (name "SPACE ID Agent ID", symbol "AI", ERC-165 reports ERC-721, NOT ERC721Enumerable).
///      Only `balanceOf` is documented in the hackathon announcement. `ownerOf` is the standard
///      ERC-721 getter; token ids were observed to equal uint256(keccak256(bytes(label))).
interface IAgentId {
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

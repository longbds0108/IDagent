// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Mimics the observed behaviour of the official Agent ID contract:
///      tokenId = uint256(keccak256(bytes(label))), one token per address, non-transferable,
///      `ownerOf` reverts for unminted ids.
contract MockAgentId {
    mapping(uint256 => address) public owners;
    mapping(address => uint256) public balanceOf;

    error NonexistentToken(uint256 tokenId);

    function mint(address to, string calldata label) external returns (uint256 tokenId) {
        tokenId = uint256(keccak256(bytes(label)));
        require(owners[tokenId] == address(0), "taken");
        require(balanceOf[to] == 0, "one per address");
        owners[tokenId] = to;
        balanceOf[to] = 1;
    }

    function burn(string calldata label) external {
        uint256 tokenId = uint256(keccak256(bytes(label)));
        address o = owners[tokenId];
        delete owners[tokenId];
        balanceOf[o] = 0;
    }

    function ownerOf(uint256 tokenId) external view returns (address o) {
        o = owners[tokenId];
        if (o == address(0)) revert NonexistentToken(tokenId);
    }
}

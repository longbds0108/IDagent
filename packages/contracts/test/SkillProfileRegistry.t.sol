// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {SkillProfileRegistry} from "../src/SkillProfileRegistry.sol";
import {AgentIdGate} from "../src/AgentIdGate.sol";
import {Keys} from "../src/lib/Keys.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract SkillProfileRegistryTest is BaseTest {
    function test_constructorRejectsAgentIdWithoutCode() public {
        vm.expectRevert(abi.encodeWithSelector(AgentIdGate.AgentIdContractHasNoCode.selector, address(0xdead)));
        new SkillProfileRegistry(address(0xdead), admin);
    }

    function test_createProfileWithVerifiedLabel() public {
        uint256 tokenId = uint256(keccak256("alice"));
        vm.expectEmit(true, true, true, true);
        emit SkillProfileRegistry.ProfileCreated(1, alice, tokenId, "alice", URI, HASH);
        uint256 id = _profile(alice, "alice");
        assertEq(id, 1);
        assertEq(profiles.profileOf(alice), 1);
        assertEq(profiles.profileOfAgentId(tokenId), 1);
        SkillProfileRegistry.Profile memory p = profiles.getProfile(1);
        assertEq(p.owner, alice);
        assertEq(p.agentIdTokenId, tokenId);
        assertEq(p.agentLabel, "alice");
        assertEq(p.metadataHash, HASH);
        assertEq(p.version, 1);
        assertEq(p.createdBlock, block.number);
    }

    function test_createProfileWithoutLabel() public {
        uint256 id = _profile(alice, "");
        assertEq(profiles.getProfile(id).agentIdTokenId, 0);
    }

    function test_walletWithoutAgentIdCannotCreate() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(AgentIdGate.NotAgentIdHolder.selector, mallory));
        profiles.createProfile("", URI, HASH);
    }

    function test_cannotClaimSomeoneElsesLabel() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SkillProfileRegistry.AgentLabelNotOwned.selector, "bob", alice));
        profiles.createProfile("bob", URI, HASH);
    }

    function test_cannotClaimUnmintedLabel() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SkillProfileRegistry.AgentLabelNotOwned.selector, "nobody", alice));
        profiles.createProfile("nobody", URI, HASH);
    }

    function test_oneProfilePerAccount() public {
        _profile(alice, "alice");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SkillProfileRegistry.ProfileAlreadyExists.selector, alice, 1));
        profiles.createProfile("", URI, HASH);
    }

    function test_rejectsEmptyOrOversizedMetadata() public {
        vm.startPrank(alice);
        vm.expectRevert(Keys.InvalidURI.selector);
        profiles.createProfile("", "", HASH);
        vm.expectRevert(Keys.InvalidURI.selector);
        profiles.createProfile("", string(new bytes(257)), HASH);
        vm.expectRevert(Keys.InvalidHash.selector);
        profiles.createProfile("", URI, bytes32(0));
        vm.stopPrank();
    }

    function test_ownerCanUpdateOwnProfile() public {
        _profile(alice, "alice");
        bytes32 h2 = keccak256("v2");
        vm.expectEmit(true, true, false, true);
        emit SkillProfileRegistry.ProfileMetadataUpdated(1, alice, "ipfs://v2", h2, 2);
        vm.prank(alice);
        profiles.updateProfile("ipfs://v2", h2);
        SkillProfileRegistry.Profile memory p = profiles.getProfile(1);
        assertEq(p.metadataURI, "ipfs://v2");
        assertEq(p.metadataHash, h2);
        assertEq(p.version, 2);
    }

    function test_cannotModifyAnotherProfile() public {
        _profile(alice, "alice");
        // bob has no profile -> update targets nothing; there is no way to address alice's profile
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SkillProfileRegistry.NoProfile.selector, bob));
        profiles.updateProfile("ipfs://evil", keccak256("evil"));
        _profile(bob, "bob");
        vm.prank(bob);
        profiles.updateProfile("ipfs://bob2", keccak256("bob2"));
        assertEq(profiles.getProfile(1).metadataURI, URI, "alice untouched");
        assertEq(profiles.getProfile(2).metadataURI, "ipfs://bob2");
    }

    function test_holderWhoLostAgentIdCannotUpdate() public {
        _profile(alice, "alice");
        agentId.burn("alice");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(AgentIdGate.NotAgentIdHolder.selector, alice));
        profiles.updateProfile("ipfs://x", HASH);
    }

    function test_bindLabelLater() public {
        _profile(alice, "");
        vm.prank(alice);
        profiles.bindAgentLabel("alice");
        assertEq(profiles.getProfile(1).agentLabel, "alice");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SkillProfileRegistry.LabelAlreadyBound.selector, 1));
        profiles.bindAgentLabel("alice");
    }

    function test_pauseBlocksWritesAndOnlyPauser() public {
        vm.prank(mallory);
        vm.expectRevert();
        profiles.pause();
        vm.prank(admin);
        profiles.pause();
        vm.prank(alice);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        profiles.createProfile("", URI, HASH);
        vm.prank(admin);
        profiles.unpause();
        _profile(alice, "alice");
    }

    function test_getProfilesPagination() public {
        _profile(alice, "alice");
        _profile(bob, "bob");
        _profile(carol, "carol");
        SkillProfileRegistry.Profile[] memory page = profiles.getProfiles(1, 10);
        assertEq(page.length, 2);
        assertEq(page[0].owner, bob);
        assertEq(profiles.getProfiles(5, 10).length, 0);
    }

    function test_getProfileUnknownReverts() public {
        vm.expectRevert(abi.encodeWithSelector(SkillProfileRegistry.ProfileNotFound.selector, 9));
        profiles.getProfile(9);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";
import {Keys} from "../src/lib/Keys.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

contract CredentialRegistryTest is BaseTest {
    uint256 internal aliceProfile;
    bytes32 internal constant WINNER = bytes32("hackathon-winner");

    function setUp() public override {
        super.setUp();
        aliceProfile = _profile(alice, "alice");
    }

    function _issue(uint64 expiresAt) internal returns (uint256 id) {
        vm.prank(org);
        id = credentials.issueCredential(aliceProfile, WINNER, URI, HASH, expiresAt);
    }

    function test_unauthorizedIssuerCannotMint() public {
        bytes32 role = credentials.ISSUER_ROLE();
        vm.prank(org);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, org, role));
        credentials.issueCredential(aliceProfile, WINNER, URI, HASH, 0);
        // An Agent ID holder is not automatically an issuer either.
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, bob, role));
        credentials.issueCredential(aliceProfile, WINNER, URI, HASH, 0);
    }

    function test_onlyAdminSetsIssuer() public {
        vm.prank(mallory);
        vm.expectRevert();
        credentials.setIssuer(org, true, "Org", "");
        _approveOrg();
        assertTrue(credentials.isIssuer(org));
        CredentialRegistry.Issuer memory info = credentials.getIssuer(org);
        assertEq(info.name, "Example Hackathon Org");
        assertTrue(info.active);
    }

    function test_issuerRoleOnlyViaSetIssuer() public {
        bytes32 role = credentials.ISSUER_ROLE();
        vm.prank(admin);
        vm.expectRevert(CredentialRegistry.UseSetIssuer.selector);
        credentials.grantRole(role, org);
    }

    function test_issueAndVerify() public {
        _approveOrg();
        uint256 id = _issue(0);
        (bool valid, CredentialRegistry.CredentialStatus status, CredentialRegistry.Credential memory c, CredentialRegistry.Issuer memory info) =
            credentials.verifyCredential(id);
        assertTrue(valid);
        assertEq(uint8(status), uint8(CredentialRegistry.CredentialStatus.Valid));
        assertEq(c.issuer, org);
        assertEq(c.subjectProfileId, aliceProfile);
        assertEq(info.name, "Example Hackathon Org");
        assertEq(credentials.credentialIdsOf(aliceProfile).length, 1);
        assertEq(credentials.credentialIdsIssuedBy(org).length, 1);
    }

    function test_revokedCredentialNotActive() public {
        _approveOrg();
        uint256 id = _issue(0);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.NotAuthorizedToRevoke.selector, id, bob));
        credentials.revokeCredential(id);
        vm.prank(org);
        credentials.revokeCredential(id);
        (bool valid, CredentialRegistry.CredentialStatus status,,) = credentials.verifyCredential(id);
        assertFalse(valid);
        assertEq(uint8(status), uint8(CredentialRegistry.CredentialStatus.Revoked));
        assertEq(credentials.getCredential(id).revokedBy, org);
    }

    function test_adminGovernanceRevoke() public {
        _approveOrg();
        uint256 id = _issue(0);
        vm.prank(admin);
        credentials.revokeCredential(id);
        assertEq(credentials.getCredential(id).revokedBy, admin);
    }

    function test_expiredCredentialNotActive() public {
        _approveOrg();
        uint256 id = _issue(uint64(block.timestamp + 1 days));
        assertEq(uint8(credentials.credentialStatus(id)), uint8(CredentialRegistry.CredentialStatus.Valid));
        vm.warp(block.timestamp + 1 days);
        assertEq(uint8(credentials.credentialStatus(id)), uint8(CredentialRegistry.CredentialStatus.Expired));
    }

    function test_pastExpiryRejected() public {
        _approveOrg();
        vm.warp(1000);
        vm.prank(org);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.InvalidExpiry.selector, uint64(999)));
        credentials.issueCredential(aliceProfile, WINNER, URI, HASH, 999);
    }

    function test_removedIssuerCredentialsBecomeInactiveAndCannotIssue() public {
        _approveOrg();
        uint256 id = _issue(0);
        vm.prank(admin);
        credentials.setIssuer(org, false, "", "");
        assertEq(uint8(credentials.credentialStatus(id)), uint8(CredentialRegistry.CredentialStatus.IssuerInactive));
        vm.prank(org);
        vm.expectRevert();
        credentials.issueCredential(aliceProfile, WINNER, URI, HASH, 0);
        // removed issuer can still revoke what it issued
        vm.prank(org);
        credentials.revokeCredential(id);
        (address[] memory addrs, CredentialRegistry.Issuer[] memory infos) = credentials.getIssuers();
        assertEq(addrs.length, 1);
        assertFalse(infos[0].active);
    }

    function test_cannotIssueToUnknownOrOwnProfile() public {
        _approveOrg();
        vm.prank(org);
        vm.expectRevert(abi.encodeWithSelector(CredentialRegistry.ProfileNotFound.selector, 42));
        credentials.issueCredential(42, WINNER, URI, HASH, 0);

        vm.prank(admin);
        credentials.setIssuer(bob, true, "Bob Org", "");
        uint256 bobProfile = _profile(bob, "bob");
        vm.prank(bob);
        vm.expectRevert(CredentialRegistry.SelfIssuance.selector);
        credentials.issueCredential(bobProfile, WINNER, URI, HASH, 0);
    }

    function test_validation() public {
        _approveOrg();
        vm.startPrank(org);
        vm.expectRevert(abi.encodeWithSelector(Keys.InvalidKey.selector, bytes32("Winner!")));
        credentials.issueCredential(aliceProfile, bytes32("Winner!"), URI, HASH, 0);
        vm.expectRevert(Keys.InvalidHash.selector);
        credentials.issueCredential(aliceProfile, WINNER, URI, bytes32(0), 0);
        vm.stopPrank();
        vm.prank(admin);
        vm.expectRevert(CredentialRegistry.InvalidName.selector);
        credentials.setIssuer(carol, true, "", "");
    }

    function test_pauseBlocksIssueNotRevoke() public {
        _approveOrg();
        uint256 id = _issue(0);
        vm.prank(admin);
        credentials.pause();
        vm.prank(org);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        credentials.issueCredential(aliceProfile, WINNER, URI, HASH, 0);
        vm.prank(org);
        credentials.revokeCredential(id);
    }
}

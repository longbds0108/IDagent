// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {SkillAttestation} from "../src/SkillAttestation.sol";
import {AgentIdGate} from "../src/AgentIdGate.sol";
import {Keys} from "../src/lib/Keys.sol";

contract SkillAttestationTest is BaseTest {
    uint256 internal aliceProfile;
    uint256 internal aliceProject;

    function setUp() public override {
        super.setUp();
        aliceProfile = _profile(alice, "alice");
        aliceProject = _project(alice, aliceProfile);
    }

    function _attest(address who) internal returns (uint256) {
        vm.prank(who);
        return attestations.attest(aliceProfile, aliceProject, SOLIDITY, keccak256("note"));
    }

    function test_peerAttests() public {
        vm.expectEmit(true, true, true, true);
        emit SkillAttestation.AttestationIssued(1, bob, aliceProfile, aliceProject, SOLIDITY, keccak256("note"));
        uint256 id = _attest(bob);
        assertTrue(attestations.isActive(id));
        SkillAttestation.Attestation memory a = attestations.getAttestation(id);
        assertEq(a.issuer, bob);
        assertEq(a.skillKey, SOLIDITY);
        assertEq(attestations.receivedCount(aliceProfile), 1);
        assertEq(attestations.issuedCount(bob), 1);
    }

    function test_attesterNeedsNoProfileButNeedsAgentId() public {
        _attest(bob); // bob has no profile
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(AgentIdGate.NotAgentIdHolder.selector, mallory));
        attestations.attest(aliceProfile, aliceProject, SOLIDITY, 0);
    }

    function test_selfAttestationFails() public {
        vm.prank(alice);
        vm.expectRevert(SkillAttestation.SelfAttestation.selector);
        attestations.attest(aliceProfile, aliceProject, SOLIDITY, 0);
    }

    function test_duplicateActiveAttestationFails() public {
        uint256 id = _attest(bob);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SkillAttestation.DuplicateActiveAttestation.selector, id));
        attestations.attest(aliceProfile, aliceProject, SOLIDITY, keccak256("other note"));
    }

    function test_sameIssuerDifferentSkillOk_differentIssuerSameSkillOk() public {
        _attest(bob);
        vm.prank(bob);
        attestations.attest(aliceProfile, aliceProject, bytes32("next.js"), 0);
        _attest(carol);
        assertEq(attestations.receivedCount(aliceProfile), 3);
    }

    function test_revokedIsNotActiveAndCanReattest() public {
        uint256 id = _attest(bob);
        vm.prank(bob);
        attestations.revokeAttestation(id);
        assertFalse(attestations.isActive(id));
        SkillAttestation.Attestation memory a = attestations.getAttestation(id);
        assertTrue(a.revoked);
        uint256 id2 = _attest(bob);
        assertTrue(id2 != id);
        assertEq(attestations.receivedCount(aliceProfile), 2, "revoked history kept");
    }

    function test_onlyIssuerRevokes() public {
        uint256 id = _attest(bob);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(SkillAttestation.NotIssuer.selector, id, alice));
        attestations.revokeAttestation(id);
        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(SkillAttestation.NotIssuer.selector, id, admin));
        attestations.revokeAttestation(id);
        vm.prank(bob);
        attestations.revokeAttestation(id);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SkillAttestation.AlreadyRevoked.selector, id));
        attestations.revokeAttestation(id);
    }

    function test_projectMustBeActiveAndBelongToSubject() public {
        uint256 bobProfile = _profile(bob, "bob");
        uint256 bobProject = _project(bob, bobProfile);
        vm.prank(carol);
        vm.expectRevert(
            abi.encodeWithSelector(SkillAttestation.ProjectNotActiveForProfile.selector, bobProject, aliceProfile)
        );
        attestations.attest(aliceProfile, bobProject, SOLIDITY, 0);

        vm.prank(alice);
        projects.revokeProject(aliceProject);
        vm.prank(carol);
        vm.expectRevert(
            abi.encodeWithSelector(SkillAttestation.ProjectNotActiveForProfile.selector, aliceProject, aliceProfile)
        );
        attestations.attest(aliceProfile, aliceProject, SOLIDITY, 0);
    }

    function test_unknownProfileFails() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(SkillAttestation.ProfileNotFound.selector, 99));
        attestations.attest(99, aliceProject, SOLIDITY, 0);
    }

    function test_invalidSkillKeyFails() public {
        vm.startPrank(bob);
        vm.expectRevert(abi.encodeWithSelector(Keys.InvalidKey.selector, bytes32("Solidity")));
        attestations.attest(aliceProfile, aliceProject, bytes32("Solidity"), 0);
        vm.expectRevert(abi.encodeWithSelector(Keys.InvalidKey.selector, bytes32(0)));
        attestations.attest(aliceProfile, aliceProject, bytes32(0), 0);
        vm.stopPrank();
    }

    function test_pagination() public {
        _attest(bob);
        _attest(carol);
        (uint256[] memory ids, SkillAttestation.Attestation[] memory items) = attestations.getReceived(aliceProfile, 1, 5);
        assertEq(ids.length, 1);
        assertEq(items[0].issuer, carol);
        (ids,) = attestations.getIssued(bob, 0, 5);
        assertEq(ids.length, 1);
        (ids,) = attestations.getReceived(aliceProfile, 9, 5);
        assertEq(ids.length, 0);
    }

    function test_revokeWorksWhilePaused() public {
        uint256 id = _attest(bob);
        vm.prank(admin);
        attestations.pause();
        vm.prank(bob);
        attestations.revokeAttestation(id);
        assertFalse(attestations.isActive(id));
    }

    /// Fuzz: arbitrary sequences of attest/revoke by bob never leave two active attestations
    /// for the same key, and activeAttestationByKey always points to an active record.
    function testFuzz_noDuplicateActive(uint8[16] memory ops) public {
        bytes32[3] memory skills = [bytes32("solidity"), bytes32("rust"), bytes32("ui-design")];
        for (uint256 i; i < ops.length; ++i) {
            bytes32 skill = skills[ops[i] % 3];
            bytes32 key = attestations.attestationKey(bob, aliceProfile, aliceProject, skill);
            uint256 active = attestations.activeAttestationByKey(key);
            vm.prank(bob);
            if (ops[i] & 0x80 == 0) {
                if (active == 0) {
                    attestations.attest(aliceProfile, aliceProject, skill, 0);
                } else {
                    vm.expectRevert(abi.encodeWithSelector(SkillAttestation.DuplicateActiveAttestation.selector, active));
                    attestations.attest(aliceProfile, aliceProject, skill, 0);
                }
            } else if (active != 0) {
                attestations.revokeAttestation(active);
            }
        }
        for (uint256 s; s < 3; ++s) {
            uint256 id = attestations.activeAttestationByKey(
                attestations.attestationKey(bob, aliceProfile, aliceProject, skills[s])
            );
            if (id != 0) assertTrue(attestations.isActive(id));
        }
    }
}

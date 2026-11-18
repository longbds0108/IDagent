// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

/// End-to-end vertical slice: register -> add project -> peer attest -> issue credential -> verify.
contract FlowTest is BaseTest {
    function test_fullVerticalSlice() public {
        uint256 aliceProfile = _profile(alice, "alice");
        uint256 project = _project(alice, aliceProfile);

        vm.prank(bob);
        uint256 att = attestations.attest(aliceProfile, project, SOLIDITY, keccak256("worked together"));

        _approveOrg();
        vm.prank(org);
        uint256 cred = credentials.issueCredential(aliceProfile, bytes32("hackathon-winner"), URI, HASH, 0);

        assertTrue(projects.isActive(project));
        assertTrue(attestations.isActive(att));
        (bool valid,,,) = credentials.verifyCredential(cred);
        assertTrue(valid);

        // Trust levels stay separate: the attestation lives in SkillAttestation, the credential in
        // CredentialRegistry; neither changes the self-reported project record.
        assertEq(projects.getProject(project).creator, alice);
        assertEq(uint8(credentials.credentialStatus(cred)), uint8(CredentialRegistry.CredentialStatus.Valid));
    }
}

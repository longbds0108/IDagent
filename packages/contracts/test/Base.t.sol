// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockAgentId} from "./mocks/MockAgentId.sol";
import {SkillProfileRegistry} from "../src/SkillProfileRegistry.sol";
import {ProjectEvidenceRegistry} from "../src/ProjectEvidenceRegistry.sol";
import {SkillAttestation} from "../src/SkillAttestation.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

abstract contract BaseTest is Test {
    MockAgentId internal agentId;
    SkillProfileRegistry internal profiles;
    ProjectEvidenceRegistry internal projects;
    SkillAttestation internal attestations;
    CredentialRegistry internal credentials;

    address internal admin = makeAddr("admin");
    address internal alice = makeAddr("alice"); // builder with Agent ID
    address internal bob = makeAddr("bob"); // peer with Agent ID
    address internal carol = makeAddr("carol"); // peer with Agent ID
    address internal mallory = makeAddr("mallory"); // no Agent ID
    address internal org = makeAddr("org"); // organization issuer (no Agent ID needed)

    string internal constant URI = "https://skillproof.example/api/metadata/0xabc";
    bytes32 internal constant HASH = keccak256("metadata");
    bytes32 internal constant SOLIDITY = bytes32("solidity");

    function setUp() public virtual {
        agentId = new MockAgentId();
        agentId.mint(alice, "alice");
        agentId.mint(bob, "bob");
        agentId.mint(carol, "carol");

        profiles = new SkillProfileRegistry(address(agentId), admin);
        projects = new ProjectEvidenceRegistry(address(agentId), address(profiles), admin);
        attestations = new SkillAttestation(address(agentId), address(profiles), address(projects), admin);
        credentials = new CredentialRegistry(address(profiles), admin);
    }

    function _profile(address who, string memory label) internal returns (uint256 id) {
        vm.prank(who);
        id = profiles.createProfile(label, URI, HASH);
    }

    function _project(address who, uint256 profileId) internal returns (uint256 id) {
        vm.prank(who);
        id = projects.addProject(profileId, URI, keccak256(abi.encode(who, profileId, block.number)));
    }

    function _approveOrg() internal {
        vm.prank(admin);
        credentials.setIssuer(org, true, "Example Hackathon Org", "https://org.example");
    }
}

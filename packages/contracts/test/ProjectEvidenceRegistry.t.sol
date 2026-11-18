// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseTest} from "./Base.t.sol";
import {ProjectEvidenceRegistry} from "../src/ProjectEvidenceRegistry.sol";
import {AgentIdGate} from "../src/AgentIdGate.sol";

contract ProjectEvidenceRegistryTest is BaseTest {
    uint256 internal aliceProfile;

    function setUp() public override {
        super.setUp();
        aliceProfile = _profile(alice, "alice");
    }

    function test_addProject() public {
        bytes32 ev = keccak256("evidence-v1");
        vm.expectEmit(true, true, true, true);
        emit ProjectEvidenceRegistry.ProjectAdded(1, aliceProfile, alice, URI, ev);
        vm.prank(alice);
        uint256 id = projects.addProject(aliceProfile, URI, ev);
        ProjectEvidenceRegistry.Project memory p = projects.getProject(id);
        assertEq(p.creator, alice);
        assertEq(p.evidenceHash, ev);
        assertEq(uint8(p.status), uint8(ProjectEvidenceRegistry.ProjectStatus.Active));
        assertTrue(projects.isActive(id));
    }

    function test_nonHolderCannotAdd() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(AgentIdGate.NotAgentIdHolder.selector, mallory));
        projects.addProject(aliceProfile, URI, HASH);
    }

    function test_cannotAddToAnotherProfile() public {
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProjectEvidenceRegistry.NotProfileOwner.selector, aliceProfile, bob));
        projects.addProject(aliceProfile, URI, HASH);
    }

    function test_supersedeKeepsOriginalEvidenceHash() public {
        bytes32 v1 = keccak256("v1");
        bytes32 v2 = keccak256("v2");
        vm.prank(alice);
        uint256 a = projects.addProject(aliceProfile, URI, v1);
        vm.roll(block.number + 5);
        vm.prank(alice);
        uint256 b = projects.supersedeProject(a, "ipfs://v2", v2);

        ProjectEvidenceRegistry.Project memory oldP = projects.getProject(a);
        ProjectEvidenceRegistry.Project memory newP = projects.getProject(b);
        assertEq(oldP.evidenceHash, v1, "original hash bound to original record");
        assertEq(uint8(oldP.status), uint8(ProjectEvidenceRegistry.ProjectStatus.Superseded));
        assertEq(oldP.supersededBy, b);
        assertEq(newP.supersedes, a);
        assertEq(newP.evidenceHash, v2);
        assertEq(projects.projectIdsOf(aliceProfile).length, 2, "both records visible");

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProjectEvidenceRegistry.ProjectNotActive.selector, a));
        projects.supersedeProject(a, URI, v2);
    }

    function test_onlyCreatorCanSupersedeOrRevoke() public {
        uint256 id = _project(alice, aliceProfile);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProjectEvidenceRegistry.NotProjectCreator.selector, id, bob));
        projects.supersedeProject(id, URI, HASH);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(ProjectEvidenceRegistry.NotProjectCreator.selector, id, bob));
        projects.revokeProject(id);
    }

    function test_revokeWorksWhilePaused() public {
        uint256 id = _project(alice, aliceProfile);
        vm.prank(admin);
        projects.pause();
        vm.prank(alice);
        projects.revokeProject(id);
        assertFalse(projects.isActive(id));
        (uint256 pid, bool active) = projects.projectStatus(id);
        assertEq(pid, aliceProfile);
        assertFalse(active);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(ProjectEvidenceRegistry.ProjectNotActive.selector, id));
        projects.revokeProject(id);
    }

    function test_projectCap() public {
        uint256 cap = projects.MAX_PROJECTS_PER_PROFILE();
        vm.startPrank(alice);
        for (uint256 i; i < cap; ++i) {
            projects.addProject(aliceProfile, URI, bytes32(i + 1));
        }
        vm.expectRevert(abi.encodeWithSelector(ProjectEvidenceRegistry.TooManyProjects.selector, aliceProfile));
        projects.addProject(aliceProfile, URI, HASH);
        vm.stopPrank();
    }

    function test_getProjectsOf() public {
        _project(alice, aliceProfile);
        _project(alice, aliceProfile);
        (uint256[] memory ids, ProjectEvidenceRegistry.Project[] memory items) = projects.getProjectsOf(aliceProfile);
        assertEq(ids.length, 2);
        assertEq(items[1].creator, alice);
    }
}

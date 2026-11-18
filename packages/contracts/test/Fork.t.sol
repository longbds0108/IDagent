// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {SkillProfileRegistry} from "../src/SkillProfileRegistry.sol";
import {AgentIdGate} from "../src/AgentIdGate.sol";

/// Runs only when BSC_MAINNET_RPC_URL is set: exercises the REAL Agent ID contract on a fork
/// of BNB Smart Chain mainnet (chain 56). Nothing is broadcast.
contract ForkTest is Test {
    address internal constant AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    // A real Agent ID holder observed on-chain: label "yahaya38" -> tokenId keccak256("yahaya38").
    address internal constant HOLDER = 0xED557784940A755164b4F272A7F32f999f43e679;
    string internal constant HOLDER_LABEL = "yahaya38";

    SkillProfileRegistry internal profiles;
    bool internal enabled;

    function setUp() public {
        string memory rpc = vm.envOr("BSC_MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        enabled = true;
        profiles = new SkillProfileRegistry(AGENT_ID, address(this));
    }

    function test_fork_chainIsBscMainnet() public view {
        if (!enabled) return;
        assertEq(block.chainid, 56);
        assertGt(AGENT_ID.code.length, 0);
    }

    function test_fork_realHolderCanRegisterWithLabel() public {
        if (!enabled) return;
        assertTrue(profiles.isAgentIdHolder(HOLDER));
        vm.prank(HOLDER);
        uint256 id = profiles.createProfile(HOLDER_LABEL, "https://example.org/m", keccak256("m"));
        assertEq(profiles.getProfile(id).agentIdTokenId, uint256(keccak256(bytes(HOLDER_LABEL))));
    }

    function test_fork_nonHolderRejected() public {
        if (!enabled) return;
        address nobody = makeAddr("nobody-without-agent-id");
        vm.prank(nobody);
        vm.expectRevert(abi.encodeWithSelector(AgentIdGate.NotAgentIdHolder.selector, nobody));
        profiles.createProfile("", "https://example.org/m", keccak256("m"));
    }

    function test_fork_holderCannotClaimOthersLabel() public {
        if (!enabled) return;
        vm.prank(HOLDER);
        vm.expectRevert();
        profiles.createProfile("superskie", "https://example.org/m", keccak256("m"));
    }
}

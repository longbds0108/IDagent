// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAgentId} from "./interfaces/IAgentId.sol";

/// @title AgentIdGate
/// @notice Shared eligibility check: an account is eligible when the official Agent ID
///         contract reports `balanceOf(account) > 0`. Holding an Agent ID is NOT proof of a
///         unique human; it is only the hackathon-defined eligibility signal.
abstract contract AgentIdGate {
    IAgentId public immutable agentId;

    error AgentIdContractHasNoCode(address agentId);
    error NotAgentIdHolder(address account);

    constructor(address agentId_) {
        if (agentId_.code.length == 0) revert AgentIdContractHasNoCode(agentId_);
        agentId = IAgentId(agentId_);
    }

    /// @notice True when `account` holds at least one Agent ID. Fails closed on call errors.
    function isAgentIdHolder(address account) public view returns (bool) {
        try agentId.balanceOf(account) returns (uint256 bal) {
            return bal > 0;
        } catch {
            return false;
        }
    }

    modifier onlyAgentIdHolder() {
        if (!isAgentIdHolder(msg.sender)) revert NotAgentIdHolder(msg.sender);
        _;
    }
}

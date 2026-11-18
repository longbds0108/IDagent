// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

/// @notice Admin helper: approve (or remove) an organization issuer. Mainnet only.
/// env: CREDENTIAL_REGISTRY, ISSUER_ADDRESS, ISSUER_APPROVED (true/false), ISSUER_NAME, ISSUER_URI
contract SetIssuer is Script {
    function run() external {
        require(block.chainid == 56, "BNB Smart Chain mainnet (56) only");
        CredentialRegistry reg = CredentialRegistry(vm.envAddress("CREDENTIAL_REGISTRY"));
        vm.startBroadcast();
        reg.setIssuer(
            vm.envAddress("ISSUER_ADDRESS"),
            vm.envBool("ISSUER_APPROVED"),
            vm.envOr("ISSUER_NAME", string("")),
            vm.envOr("ISSUER_URI", string(""))
        );
        vm.stopBroadcast();
    }
}

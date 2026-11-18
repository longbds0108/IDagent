// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SkillProfileRegistry} from "../src/SkillProfileRegistry.sol";
import {ProjectEvidenceRegistry} from "../src/ProjectEvidenceRegistry.sol";
import {SkillAttestation} from "../src/SkillAttestation.sol";
import {CredentialRegistry} from "../src/CredentialRegistry.sol";

interface IERC165Like {
    function supportsInterface(bytes4 id) external view returns (bool);
}

/// @notice Deploys the four SkillProof contracts to BNB Smart Chain MAINNET (chain 56) only.
/// @dev Fails closed when:
///      - DEPLOY_CHAIN_ID != 56 or block.chainid != 56
///      - AGENT_ID_CONTRACT_ADDRESS has no bytecode or does not report ERC-721 via ERC-165
///      Signing is supplied on the CLI (`--account <keystore>` / `--ledger`); this script never
///      reads a private key. Run without `--broadcast` first to simulate.
contract Deploy is Script {
    uint256 internal constant BSC_MAINNET = 56;
    bytes4 internal constant ERC721_INTERFACE_ID = 0x80ac58cd;

    function run() external {
        uint256 expected = vm.envUint("DEPLOY_CHAIN_ID");
        require(expected == BSC_MAINNET, "DEPLOY_CHAIN_ID must be 56 (BNB Smart Chain mainnet)");
        require(block.chainid == BSC_MAINNET, "connected RPC is not BNB Smart Chain mainnet (56)");

        address agentId = vm.envAddress("AGENT_ID_CONTRACT_ADDRESS");
        require(agentId.code.length > 0, "AGENT_ID_CONTRACT_ADDRESS has no bytecode on this chain");
        require(IERC165Like(agentId).supportsInterface(ERC721_INTERFACE_ID), "Agent ID contract is not ERC-721");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address admin = vm.envOr("ADMIN_ADDRESS", deployer);

        SkillProfileRegistry profiles = new SkillProfileRegistry(agentId, admin);
        ProjectEvidenceRegistry projects = new ProjectEvidenceRegistry(agentId, address(profiles), admin);
        SkillAttestation attestations = new SkillAttestation(agentId, address(profiles), address(projects), admin);
        CredentialRegistry credentials = new CredentialRegistry(address(profiles), admin);
        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("admin", admin);
        console2.log("SkillProfileRegistry", address(profiles));
        console2.log("ProjectEvidenceRegistry", address(projects));
        console2.log("SkillAttestation", address(attestations));
        console2.log("CredentialRegistry", address(credentials));

        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "deployBlock", block.number);
        vm.serializeAddress(o, "agentId", agentId);
        vm.serializeAddress(o, "admin", admin);
        vm.serializeAddress(o, "skillProfileRegistry", address(profiles));
        vm.serializeAddress(o, "projectEvidenceRegistry", address(projects));
        vm.serializeAddress(o, "skillAttestation", address(attestations));
        string memory json = vm.serializeAddress(o, "credentialRegistry", address(credentials));
        string memory file = vm.envOr("DEPLOYMENT_OUT", string("deployments/56.json"));
        vm.writeJson(json, file);
    }
}

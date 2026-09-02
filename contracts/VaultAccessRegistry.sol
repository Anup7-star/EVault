// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Vault Access Registry
/// @notice On-chain source of truth for enterprise vault access permissions.
/// Admins register vaults and grant time-bound access to wallet addresses.
/// Expiry is enforced on-chain (not in a backend DB), so it can't be silently overridden.
contract VaultAccessRegistry {
    struct Vault {
        uint256 id;
        address owner;
        string name;
        bool exists;
    }

    struct AccessGrant {
        bool granted;
        uint256 expiryTimestamp;
    }

    uint256 public nextVaultId;
    mapping(uint256 => Vault) public vaults;
    mapping(uint256 => mapping(address => AccessGrant)) public access;
    mapping(uint256 => address[]) private vaultGrantees; // for audit/listing

    event VaultRegistered(uint256 indexed vaultId, address indexed owner, string name);
    event AccessGranted(uint256 indexed vaultId, address indexed wallet, uint256 expiryTimestamp);
    event AccessRevoked(uint256 indexed vaultId, address indexed wallet);

    modifier onlyVaultOwner(uint256 vaultId) {
        require(vaults[vaultId].exists, "Vault does not exist");
        require(vaults[vaultId].owner == msg.sender, "Not vault owner");
        _;
    }

    function registerVault(string calldata name) external returns (uint256) {
        uint256 vaultId = nextVaultId++;
        vaults[vaultId] = Vault(vaultId, msg.sender, name, true);
        emit VaultRegistered(vaultId, msg.sender, name);
        return vaultId;
    }

    function grantAccess(uint256 vaultId, address wallet, uint256 expiryTimestamp) external onlyVaultOwner(vaultId) {
        require(expiryTimestamp > block.timestamp, "Expiry must be in the future");
        if (!access[vaultId][wallet].granted) {
            vaultGrantees[vaultId].push(wallet);
        }
        access[vaultId][wallet] = AccessGrant(true, expiryTimestamp);
        emit AccessGranted(vaultId, wallet, expiryTimestamp);
    }

    function revokeAccess(uint256 vaultId, address wallet) external onlyVaultOwner(vaultId) {
        delete access[vaultId][wallet];
        emit AccessRevoked(vaultId, wallet);
    }

    function checkAccess(uint256 vaultId, address wallet) public view returns (bool) {
        AccessGrant memory grant = access[vaultId][wallet];
        return grant.granted && grant.expiryTimestamp > block.timestamp;
    }

    function getVault(uint256 vaultId) external view returns (address owner, string memory name) {
        Vault memory v = vaults[vaultId];
        require(v.exists, "Vault does not exist");
        return (v.owner, v.name);
    }

    function getGrantees(uint256 vaultId) external view returns (address[] memory) {
        return vaultGrantees[vaultId];
    }

    function getVaultCount() external view returns (uint256) {
        return nextVaultId;
    }
}

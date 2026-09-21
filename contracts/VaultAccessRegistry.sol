// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Vault Access Registry
/// @notice On-chain source of truth for enterprise vault access permissions.
/// Admins create vaults and grant time-bound, role-tagged access to wallet addresses.
/// Expiry is enforced on-chain (not in a backend DB), so it can't be silently overridden.
contract VaultAccessRegistry {
    struct Vault {
        uint256 id;
        address owner;
        string resourceReference;
        bool exists;
    }

    struct AccessGrant {
        bool granted;
        uint256 expiresAt;
        uint8 role;
    }

    uint256 public nextVaultId;
    mapping(uint256 => Vault) public vaults;
    mapping(uint256 => mapping(address => AccessGrant)) public access;
    mapping(uint256 => address[]) private vaultGrantees; // for audit/listing

    event VaultCreated(uint256 indexed vaultId, address indexed owner, string resourceReference);
    event AccessGranted(uint256 indexed vaultId, address indexed wallet, uint256 expiresAt, uint8 role);
    event AccessRevoked(uint256 indexed vaultId, address indexed wallet);

    modifier onlyVaultOwner(uint256 vaultId) {
        require(vaults[vaultId].exists, "Vault does not exist");
        require(vaults[vaultId].owner == msg.sender, "Not vault owner");
        _;
    }

    /// @notice Create a new vault. Returns the new vault ID.
    function createVault(string calldata resourceReference) external returns (uint256 vaultId) {
        vaultId = nextVaultId++;
        vaults[vaultId] = Vault(vaultId, msg.sender, resourceReference, true);
        emit VaultCreated(vaultId, msg.sender, resourceReference);
    }

    /// @notice Grant time-bound, role-tagged access to a wallet.
    function grantAccess(
        uint256 vaultId,
        address wallet,
        uint8 role,
        uint256 expiresAt
    ) external onlyVaultOwner(vaultId) {
        require(expiresAt > block.timestamp, "Expiry must be in the future");
        if (!access[vaultId][wallet].granted) {
            vaultGrantees[vaultId].push(wallet);
        }
        access[vaultId][wallet] = AccessGrant(true, expiresAt, role);
        emit AccessGranted(vaultId, wallet, expiresAt, role);
    }

    /// @notice Revoke access for a wallet.
    function revokeAccess(uint256 vaultId, address wallet) external onlyVaultOwner(vaultId) {
        delete access[vaultId][wallet];
        emit AccessRevoked(vaultId, wallet);
    }

    /// @notice Returns true iff the wallet has an active, non-expired grant.
    function hasAccess(uint256 vaultId, address wallet) external view returns (bool) {
        AccessGrant memory g = access[vaultId][wallet];
        return g.granted && g.expiresAt > block.timestamp;
    }

    /// @notice Returns the full permission tuple: (active, expiresAt, role).
    /// `active` is computed live — it cannot go stale.
    function getPermission(uint256 vaultId, address wallet)
        external
        view
        returns (bool active, uint256 expiresAt, uint8 role)
    {
        AccessGrant memory g = access[vaultId][wallet];
        active = g.granted && g.expiresAt > block.timestamp;
        expiresAt = g.expiresAt;
        role = g.role;
    }

    // -----------------------------------------------------------------------
    // Convenience helpers (kept from original contract)
    // -----------------------------------------------------------------------

    /// @notice Alias for hasAccess — retained for backwards compatibility.
    function checkAccess(uint256 vaultId, address wallet) public view returns (bool) {
        AccessGrant memory g = access[vaultId][wallet];
        return g.granted && g.expiresAt > block.timestamp;
    }

    function getVault(uint256 vaultId) external view returns (address owner, string memory resourceReference) {
        Vault memory v = vaults[vaultId];
        require(v.exists, "Vault does not exist");
        return (v.owner, v.resourceReference);
    }

    function getGrantees(uint256 vaultId) external view returns (address[] memory) {
        return vaultGrantees[vaultId];
    }

    function getVaultCount() external view returns (uint256) {
        return nextVaultId;
    }
}

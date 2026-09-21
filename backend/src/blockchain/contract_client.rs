use ethers::prelude::*;
use std::sync::Arc;
use thiserror::Error;

abigen!(VaultAccessRegistry, "abi/VaultAccessRegistry.json");

#[derive(Debug, Error)]
pub enum ContractError {
    #[error("Provider error: {0}")]
    ProviderError(String),
    #[error("Contract error: {0}")]
    CallError(String),
}

pub enum AuthzResult {
    Allowed { role: u8 },
    Denied(String),
    ChainUnavailable,
}

pub struct ContractClient {
    contract: VaultAccessRegistry<Provider<Http>>,
}

impl ContractClient {
    pub fn new(rpc_url: &str, contract_address: &str) -> Result<Self, ContractError> {
        let provider = Provider::<Http>::try_from(rpc_url)
            .map_err(|e| ContractError::ProviderError(e.to_string()))?;
        let client = Arc::new(provider);
        let address: Address = contract_address
            .parse()
            .map_err(|e| ContractError::ProviderError(format!("Invalid address: {}", e)))?;

        let contract = VaultAccessRegistry::new(address, client);

        Ok(Self { contract })
    }

    pub async fn get_permission(
        &self,
        vault_id: u64,
        wallet: Address,
    ) -> Result<(bool, u64, u8), ContractError> {
        let vault_id_u256 = U256::from(vault_id);
        let (active, expires_at, role) = self
            .contract
            .get_permission(vault_id_u256, wallet)
            .call()
            .await
            .map_err(|e| ContractError::CallError(e.to_string()))?;

        Ok((active, expires_at.as_u64(), role))
    }

    pub async fn has_access(&self, vault_id: u64, wallet: Address) -> Result<bool, ContractError> {
        let vault_id_u256 = U256::from(vault_id);
        let active = self
            .contract
            .has_access(vault_id_u256, wallet)
            .call()
            .await
            .map_err(|e| ContractError::CallError(e.to_string()))?;

        Ok(active)
    }

    pub async fn get_vault_count(&self) -> Result<u64, ContractError> {
        let count = self
            .contract
            .get_vault_count()
            .call()
            .await
            .map_err(|e| ContractError::CallError(e.to_string()))?;

        Ok(count.as_u64())
    }

    /// Fail-closed authorization wrapper.
    pub async fn checked_authorize(&self, vault_id: u64, wallet: Address) -> AuthzResult {
        match self.get_permission(vault_id, wallet).await {
            Ok((active, _, role)) => {
                if active {
                    AuthzResult::Allowed { role }
                } else {
                    AuthzResult::Denied("No active grant or grant expired".to_string())
                }
            }
            Err(e) => {
                // Return ChainUnavailable for RPC timeouts, connection refused, etc.
                tracing::error!("Blockchain call failed during checked_authorize: {}", e);
                AuthzResult::ChainUnavailable
            }
        }
    }
}

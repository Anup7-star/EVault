//! EVault backend entry-point.
//!
//! Responsibilities:
//!   1. Load configuration from environment / `.env`
//!   2. Initialise JSON structured-logging to stdout
//!   3. Connect to Postgres and run pending sqlx migrations
//!   4. Build the axum router and start listening

use axum::{routing::get, Router};
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

use evault_backend::*;

// ── Health-check ─────────────────────────────────────────────────────────────

async fn health() -> &'static str {
    "ok"
}

// ── Entry-point ──────────────────────────────────────────────────────────────

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 1. Load .env (missing file is fine in production)
    dotenvy::dotenv().ok();

    // 2. Structured JSON logging — level driven by RUST_LOG env var
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with(tracing_subscriber::fmt::layer().json())
        .init();

    info!(version = env!("CARGO_PKG_VERSION"), "EVault backend starting");

    // 3. Config from environment
    let database_url = std::env::var("DATABASE_URL")
        .expect("DATABASE_URL must be set");

    let port: u16 = std::env::var("PORT")
        .unwrap_or_else(|_| "3001".to_string())
        .parse()
        .expect("PORT must be a valid port number");

    let rpc_url = std::env::var("RPC_URL")
        .expect("RPC_URL must be set");
    let contract_address = std::env::var("CONTRACT_ADDRESS")
        .expect("CONTRACT_ADDRESS must be set");

    // 4. Postgres connection pool
    info!("Connecting to Postgres…");
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("Failed to connect to Postgres");

    // 5. Run pending migrations
    info!("Running sqlx migrations…");
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("Failed to apply migrations");
    info!("Migrations applied successfully");

    info!("Initializing blockchain contract client...");
    let contract_client = evault_backend::blockchain::contract_client::ContractClient::new(&rpc_url, &contract_address)
        .expect("Failed to initialize contract client");
    let shared_contract_client = std::sync::Arc::new(contract_client);

    // 6. Build router
    let app = Router::new()
        // Health-check — simplest possible, no DB dependency
        .route("/health", get(health))
        .with_state(shared_contract_client);
    // Future: .merge(api::auth::router(pool.clone()))
    //         .merge(api::vaults::router(pool.clone()))
    //         .merge(api::permissions::router(pool.clone()))

    // 7. Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!(address = %addr, "Listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

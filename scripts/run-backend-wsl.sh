#!/bin/bash
set -e
source "$HOME/.cargo/env"
cd "/mnt/c/blockchain mini/backend"
echo "Starting EVault Rust Backend on port 3001..."
cargo run

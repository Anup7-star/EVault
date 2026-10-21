#!/bin/bash
service postgresql start
su - postgres << 'EOF'
psql -c "DROP DATABASE IF EXISTS evault;"
psql -c "CREATE DATABASE evault OWNER evault;"
psql -c "GRANT ALL PRIVILEGES ON DATABASE evault TO evault;"
EOF
echo "Database clean and ready for sqlx"

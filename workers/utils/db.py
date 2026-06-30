"""
Database connection pool management using asyncpg.

Provides high-performance async PostgreSQL access for analytical queries.
"""

import asyncio
from contextlib import asynccontextmanager
from typing import Optional, List, Dict, Any, AsyncGenerator
import asyncpg
from workers.config import settings


class DatabasePool:
    """Manages asyncpg connection pool for analytical queries."""
    
    _instance: Optional['DatabasePool'] = None
    _pool: Optional[asyncpg.Pool] = None
    _lock = asyncio.Lock()
    
    def __new__(cls):
        """Singleton pattern for connection pool."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    async def initialize(self) -> None:
        """Initialize the connection pool."""
        async with self._lock:
            if self._pool is None:
                db_config = settings.database
                self._pool = await asyncpg.create_pool(
                    host=db_config.host,
                    port=db_config.port,
                    database=db_config.database,
                    user=db_config.user,
                    password=db_config.password,
                    min_size=db_config.min_size,
                    max_size=db_config.max_size,
                    command_timeout=db_config.command_timeout
                )
    
    async def close(self) -> None:
        """Close the connection pool."""
        async with self._lock:
            if self._pool is not None:
                await self._pool.close()
                self._pool = None
    
    @asynccontextmanager
    async def connection(self) -> AsyncGenerator[asyncpg.Connection, None]:
        """Get a connection from the pool."""
        if self._pool is None:
            await self.initialize()
        
        async with self._pool.acquire() as conn:
            yield conn
    
    async def fetch(self, query: str, *args) -> List[asyncpg.Record]:
        """Execute a query and return all results."""
        async with self.connection() as conn:
            return await conn.fetch(query, *args)
    
    async def fetchrow(self, query: str, *args) -> Optional[asyncpg.Record]:
        """Execute a query and return a single row."""
        async with self.connection() as conn:
            return await conn.fetchrow(query, *args)
    
    async def fetchval(self, query: str, *args) -> Any:
        """Execute a query and return a single value."""
        async with self.connection() as conn:
            return await conn.fetchval(query, *args)
    
    async def execute(self, query: str, *args) -> str:
        """Execute a query and return the status."""
        async with self.connection() as conn:
            return await conn.execute(query, *args)
    
    async def executemany(self, query: str, args: List[tuple]) -> None:
        """Execute a query with multiple argument sets."""
        async with self.connection() as conn:
            await conn.executemany(query, args)
    
    @asynccontextmanager
    async def transaction(self) -> AsyncGenerator[asyncpg.Connection, None]:
        """Execute queries within a transaction."""
        async with self.connection() as conn:
            async with conn.transaction():
                yield conn


# Global pool instance
db_pool = DatabasePool()


# ============================================================================
# QUERY HELPERS
# ============================================================================

async def get_contracts_for_analysis(
    window_months: int,
    org_ids: Optional[List[str]] = None,
    min_contract_value: Optional[float] = None
) -> List[Dict[str, Any]]:
    """
    Fetch contracts for IRI analysis.
    
    Args:
        window_months: Analysis window in months
        org_ids: Optional list of organization IDs to filter
        min_contract_value: Optional minimum contract value filter
    
    Returns:
        List of contract records as dictionaries
    """
    query = """
        SELECT 
            c.contract_id,
            c.tender_id,
            c.org_id,
            c.vendor_id,
            c.contract_value,
            c.award_date,
            c.bids_received,
            c.bid_window_days,
            c.award_delay_days,
            c.tender_type,
            c.org_name,
            c.vendor_name,
            h.hhi_index
        FROM aoc_clean c
        LEFT JOIN cagg_rolling_hhi_12m h 
            ON c.org_id = h.org_id 
            AND h.bucket_month = date_trunc('month', c.award_date)
        WHERE c.contract_status = 'awarded'
          AND c.award_date >= NOW() - INTERVAL '%s months'
    """
    
    params = [window_months]
    
    if org_ids:
        query += " AND c.org_id = ANY($2::uuid[])"
        params.append(org_ids)
    
    if min_contract_value:
        param_idx = len(params) + 1
        query += f" AND c.contract_value >= ${param_idx}"
        params.append(min_contract_value)
    
    query += " ORDER BY c.award_date DESC"
    
    records = await db_pool.fetch(query, *params)
    return [dict(r) for r in records]


async def get_vendor_winrate_timeseries(
    vendor_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Fetch vendor win-rate time series from continuous aggregate.
    
    Args:
        vendor_ids: Optional list of vendor IDs to filter
    
    Returns:
        List of win-rate records as dictionaries
    """
    query = """
        SELECT 
            bucket_month,
            vendor_id,
            org_id,
            win_count,
            total_value_won,
            avg_contract_value,
            win_rate_pct,
            single_bid_wins
        FROM cagg_vendor_winrate_monthly
        WHERE bucket_month >= NOW() - INTERVAL '36 months'
    """
    
    params = []
    
    if vendor_ids:
        query += " AND vendor_id = ANY($1::uuid[])"
        params.append(vendor_ids)
    
    query += " ORDER BY vendor_id, bucket_month"
    
    records = await db_pool.fetch(query, *params)
    return [dict(r) for r in records]


async def get_bipartite_graph_data(
    window_months: int,
    org_ids: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Fetch contract data for bipartite graph construction.
    
    Args:
        window_months: Analysis window in months
        org_ids: Optional list of organization IDs to filter
    
    Returns:
        List of contract edges as dictionaries
    """
    query = """
        SELECT 
            org_id,
            vendor_id,
            org_name,
            vendor_name,
            COUNT(*) as contract_count,
            SUM(contract_value) as total_value,
            AVG(bids_received) as avg_bids
        FROM aoc_clean
        WHERE contract_status = 'awarded'
          AND award_date >= NOW() - INTERVAL '%s months'
        GROUP BY org_id, vendor_id, org_name, vendor_name
    """
    
    params = [window_months]
    
    if org_ids:
        query += " AND org_id = ANY($2::uuid[])"
        params.append(org_ids)
    
    records = await db_pool.fetch(query, *params)
    return [dict(r) for r in records]


async def get_org_cpio_address(org_id: str) -> Optional[str]:
    """
    Fetch CPIO address for an organization.
    
    Args:
        org_id: Organization UUID
    
    Returns:
        CPIO address string or None
    """
    query = """
        SELECT cpio_address
        FROM org_summary
        WHERE org_id = $1
    """
    
    return await db_pool.fetchval(query, org_id)


async def insert_rti_payload(payload: Dict[str, Any]) -> str:
    """
    Insert RTI payload into agent_rti_payloads table.
    
    Args:
        payload: RTI payload dictionary
    
    Returns:
        Status string
    """
    query = """
        INSERT INTO agent_rti_payloads (
            contract_id, org_id, vendor_id,
            rti_text, cpio_address, applicant_name, application_date,
            anomaly_type, anomaly_severity,
            hhi_at_generation, iri_at_generation,
            workflow_id, checkpoint_id,
            status, generated_at
        ) VALUES (
            $1, $2, $3,
            $4, $5, $6, $7,
            $8, $9,
            $10, $11,
            $12, $13,
            $14, $15
        )
        ON CONFLICT DO NOTHING
    """
    
    return await db_pool.execute(
        query,
        payload['contract_id'],
        payload['org_id'],
        payload.get('vendor_id'),
        payload['rti_text'],
        payload['cpio_address'],
        payload.get('applicant_name', '[Your Name]'),
        payload['application_date'],
        payload['anomaly_type'],
        payload['anomaly_severity'],
        payload.get('hhi_at_generation'),
        payload.get('iri_at_generation'),
        payload['workflow_id'],
        payload.get('checkpoint_id'),
        payload.get('status', 'generated'),
        payload['generated_at']
    )


async def insert_checkpoint(checkpoint: Dict[str, Any]) -> Optional[str]:
    """
    Insert agent checkpoint into agent_state_checkpoints table.
    
    Args:
        checkpoint: Checkpoint dictionary
    
    Returns:
        Checkpoint ID or None
    """
    query = """
        INSERT INTO agent_state_checkpoints (
            workflow_id, workflow_run_id, activity_id,
            agent_name, checkpoint_type, state,
            contract_id, org_id, vendor_id,
            execution_status, error_message,
            execution_duration_ms, expires_at
        ) VALUES (
            $1, $2, $3,
            $4, $5, $6::jsonb,
            $7, $8, $9,
            $10, $11,
            $12, $13
        )
        RETURNING checkpoint_id
    """
    
    import json
    state_json = json.dumps(checkpoint['state'])
    
    result = await db_pool.fetchval(
        query,
        checkpoint['workflow_id'],
        checkpoint.get('workflow_run_id'),
        checkpoint.get('activity_id'),
        checkpoint['agent_name'],
        checkpoint['checkpoint_type'],
        state_json,
        checkpoint.get('contract_id'),
        checkpoint.get('org_id'),
        checkpoint.get('vendor_id'),
        checkpoint.get('execution_status', 'running'),
        checkpoint.get('error_message'),
        checkpoint.get('execution_duration_ms'),
        checkpoint.get('expires_at')
    )
    
    return result
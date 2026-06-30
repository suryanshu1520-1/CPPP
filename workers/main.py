"""
Temporal Worker Entry Point.

Main entry point for starting the Temporal worker that processes
procurement analysis workflows.

Usage:
    python -m workers.main

Environment Variables:
    TEMPORAL_HOST: Temporal server host (default: localhost)
    TEMPORAL_PORT: Temporal server port (default: 7233)
    TEMPORAL_NAMESPACE: Temporal namespace (default: default)
    TEMPORAL_TASK_QUEUE: Task queue name (default: procurement-analysis)
    DB_HOST: PostgreSQL host (default: localhost)
    DB_PORT: PostgreSQL port (default: 5432)
    DB_NAME: Database name (default: tender_db)
    DB_USER: Database user (default: postgres)
    DB_PASSWORD: Database password (default: "")
    LOG_LEVEL: Logging level (default: INFO)
"""

import asyncio
import logging
import signal
import sys
from typing import List

from temporalio.client import Client
from temporalio.worker import Worker

from workers.config import settings
from workers.utils.db import db_pool

# Import activities
from workers.activities.iri_calculator import calculate_iri_activity
from workers.activities.cartel_detector import detect_cartels_activity
from workers.activities.anomaly_detector import detect_anomalies_activity
from workers.activities.rti_serializer import serialize_rti_payloads_activity

# Import workflows
from workers.workflows.procurement_analysis import ProcurementAnalysisWorkflow

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger(__name__)


async def main():
    """
    Main entry point for the Temporal worker.
    
    This function:
    1. Initializes the database connection pool
    2. Connects to the Temporal server
    3. Starts the worker with all activities and workflows
    4. Handles graceful shutdown on SIGINT/SIGTERM
    """
    logger.info("Starting Project Tender Temporal Worker")
    logger.info(f"Temporal server: {settings.temporal.target_host}")
    logger.info(f"Namespace: {settings.temporal.namespace}")
    logger.info(f"Task queue: {settings.temporal.task_queue}")
    
    # Initialize database connection pool
    logger.info("Initializing database connection pool")
    await db_pool.initialize()
    logger.info("Database connection pool initialized")
    
    # Connect to Temporal server
    logger.info("Connecting to Temporal server")
    client = await Client.connect(
        settings.temporal.target_host,
        namespace=settings.temporal.namespace
    )
    logger.info("Connected to Temporal server")
    
    # Create worker with all activities and workflows
    worker = Worker(
        client,
        task_queue=settings.temporal.task_queue,
        workflows=[ProcurementAnalysisWorkflow],
        activities=[
            calculate_iri_activity,
            detect_cartels_activity,
            detect_anomalies_activity,
            serialize_rti_payloads_activity,
        ],
        # Worker configuration
        max_concurrent_workflow_tasks=100,
        max_concurrent_activities=50,
        max_concurrent_local_activities=50,
        # Activity configuration
        activity_executor=None,  # Use default executor
        # Workflow configuration
        workflow_task_executor=None,  # Use default executor
    )
    
    logger.info("Worker configured with 4 activities and 1 workflow")
    
    # Set up graceful shutdown
    shutdown_event = asyncio.Event()
    
    def signal_handler():
        logger.info("Received shutdown signal")
        shutdown_event.set()
    
    # Register signal handlers
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, signal_handler)
    
    logger.info("Starting worker...")
    
    try:
        # Run worker until shutdown signal
        await asyncio.gather(
            worker.run(),
            shutdown_event.wait()
        )
    except asyncio.CancelledError:
        logger.info("Worker cancelled")
    finally:
        logger.info("Shutting down worker")
        
        # Gracefully shutdown worker
        await worker.shutdown()
        logger.info("Worker shutdown complete")
        
        # Close database connection pool
        await db_pool.close()
        logger.info("Database connection pool closed")
        
        logger.info("Project Tender Temporal Worker stopped")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker interrupted by user")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Worker failed: {e}", exc_info=True)
        sys.exit(1)
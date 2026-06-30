"""
Configuration management for Temporal workers.

Loads environment variables and provides typed configuration objects.
"""

import os
from typing import Optional
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings


class DatabaseConfig(BaseModel):
    """PostgreSQL connection configuration."""
    host: str = Field(default="localhost", description="PostgreSQL host")
    port: int = Field(default=5432, description="PostgreSQL port")
    database: str = Field(default="tender_db", description="Database name")
    user: str = Field(default="postgres", description="Database user")
    password: str = Field(default="", description="Database password")
    
    # Connection pool settings
    min_size: int = Field(default=5, description="Minimum pool connections")
    max_size: int = Field(default=20, description="Maximum pool connections")
    command_timeout: int = Field(default=30, description="Query timeout in seconds")
    
    @property
    def dsn(self) -> str:
        """Generate PostgreSQL DSN string."""
        return f"postgresql://{self.user}:{self.password}@{self.host}:{self.port}/{self.database}"


class TemporalConfig(BaseModel):
    """Temporal server configuration."""
    host: str = Field(default="localhost", description="Temporal server host")
    port: int = Field(default=7233, description="Temporal server port")
    namespace: str = Field(default="default", description="Temporal namespace")
    task_queue: str = Field(default="procurement-analysis", description="Task queue name")
    
    @property
    def target_host(self) -> str:
        """Generate Temporal target host string."""
        return f"{self.host}:{self.port}"


class AnalysisConfig(BaseModel):
    """Analysis parameters for fraud detection."""
    # IRI calculation
    iri_window_months: int = Field(default=12, description="Analysis window in months")
    iri_top_n: int = Field(default=100, description="Number of riskiest contracts to return")
    
    # Cartel detection
    cartel_window_months: int = Field(default=24, description="Cartel detection window")
    cartel_min_community_size: int = Field(default=5, description="Minimum community size")
    cartel_95_rule_threshold: float = Field(default=0.95, description="95% rule threshold")
    
    # Anomaly detection
    anomaly_contamination: float = Field(default=0.01, description="Expected anomaly fraction")
    anomaly_n_estimators: int = Field(default=200, description="IsolationForest estimators")
    anomaly_score_threshold: float = Field(default=-0.5, description="Anomaly score threshold")


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    # Database
    db_host: str = Field(default_factory=lambda: os.getenv("DB_HOST", "localhost"))
    db_port: int = Field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    db_name: str = Field(default_factory=lambda: os.getenv("DB_NAME", "tender_db"))
    db_user: str = Field(default_factory=lambda: os.getenv("DB_USER", "postgres"))
    db_password: str = Field(default_factory=lambda: os.getenv("DB_PASSWORD", ""))
    
    # Temporal
    temporal_host: str = Field(default_factory=lambda: os.getenv("TEMPORAL_HOST", "localhost"))
    temporal_port: int = Field(default_factory=lambda: int(os.getenv("TEMPORAL_PORT", "7233")))
    temporal_namespace: str = Field(default_factory=lambda: os.getenv("TEMPORAL_NAMESPACE", "default"))
    temporal_task_queue: str = Field(default_factory=lambda: os.getenv("TEMPORAL_TASK_QUEUE", "procurement-analysis"))
    
    # Analysis
    log_level: str = Field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO"))
    
    @property
    def database(self) -> DatabaseConfig:
        """Get database configuration."""
        return DatabaseConfig(
            host=self.db_host,
            port=self.db_port,
            database=self.db_name,
            user=self.db_user,
            password=self.db_password
        )
    
    @property
    def temporal(self) -> TemporalConfig:
        """Get Temporal configuration."""
        return TemporalConfig(
            host=self.temporal_host,
            port=self.temporal_port,
            namespace=self.temporal_namespace,
            task_queue=self.temporal_task_queue
        )
    
    @property
    def analysis(self) -> AnalysisConfig:
        """Get analysis configuration."""
        return AnalysisConfig()


# Global settings instance
settings = Settings()
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator, model_validator
import json
import re


class RegressionCase(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    function: str = Field(pattern=r'^[a-zA-Z][a-zA-Z0-9_]{0,79}$')
    args: list[Any] = Field(default_factory=list, max_length=12, description='Positional arguments: f(7) => [7]; f([7]) => [[7]].')
    kwargs: dict[str, Any] = Field(default_factory=dict)
    assertion: Literal['equals', 'contains_key', 'length', 'raises'] = 'equals'
    expected: Any

    @model_validator(mode='after')
    def assertion_shape(self):
        if self.assertion == 'contains_key' and not isinstance(self.expected, str):
            raise ValueError('contains_key expects a string key.')
        if self.assertion == 'length' and (type(self.expected) is not int or self.expected < 0):
            raise ValueError('length expects a non-negative integer.')
        if self.assertion == 'raises' and (not isinstance(self.expected, str) or not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]*', self.expected)):
            raise ValueError('raises expects an exception class name, such as ValueError.')
        return self

    @field_validator('args', 'kwargs', 'expected')
    @classmethod
    def bounded_json(cls, value):
        if len(json.dumps(value)) > 8000:
            raise ValueError('Test data must be smaller than 8 KB.')
        return value


class IncidentInput(BaseModel):
    title: str = Field(min_length=5, max_length=140)
    service: str = Field(min_length=2, max_length=80, pattern=r'^[a-zA-Z0-9 _.-]+$')
    feature: str = Field(min_length=2, max_length=100)
    function: str = Field(pattern=r'^[a-zA-Z][a-zA-Z0-9_]{0,79}$')
    severity: Literal['high', 'medium', 'low'] = 'high'
    summary: str = Field(min_length=15, max_length=5000)
    contract: str = Field(min_length=10, max_length=1500)
    source: str = Field(default='User-provided incident report', max_length=300)
    cases: list[RegressionCase] = Field(min_length=1, max_length=8)

    @field_validator('cases')
    @classmethod
    def unique_case_names(cls, cases):
        if len({c.name for c in cases}) != len(cases):
            raise ValueError('Regression case names must be unique.')
        return cases


class AnalysisInput(BaseModel):
    title: str = Field(default='Untitled change', min_length=3, max_length=140)
    service: str = Field(default='payments', min_length=2, max_length=80)
    before: str = Field(min_length=1, max_length=30000)
    after: str = Field(min_length=1, max_length=30000)
    baseline_cases: list[RegressionCase] = Field(default_factory=list, max_length=10)


class ReportInput(BaseModel):
    report: str = Field(min_length=30, max_length=12000)

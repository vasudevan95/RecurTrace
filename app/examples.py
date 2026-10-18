"""Synthetic examples. Every asserted result is computed by the Python runner."""

EXAMPLES = [
    {
        'id': 'payment-contract', 'title': 'The disappearing payment ID',
        'subtitle': 'A successful payment can still break a subscription.',
        'service': 'payments', 'function': 'create_payment',
        'before': 'def create_payment(amount):\n    return {"payment_id": "pay_123", "status": "paid", "amount": amount}\n',
        'after': 'def create_payment(amount):\n    return {"id": "pay_123", "status": "paid", "amount": amount}\n',
        'fixed': 'def create_payment(amount):\n    return {"id": "pay_123", "payment_id": "pay_123", "status": "paid", "amount": amount}\n',
        'baseline_cases': [
            {'name': 'Payment returns a status', 'function': 'create_payment', 'args': [49], 'assertion': 'contains_key', 'expected': 'status'},
            {'name': 'Payment returns an amount', 'function': 'create_payment', 'args': [49], 'assertion': 'contains_key', 'expected': 'amount'},
        ],
        'incident': {
            'title': 'Renewals failed after payment response changed', 'service': 'payments',
            'feature': 'Subscription renewals', 'function': 'create_payment', 'severity': 'high',
            'summary': 'A payment response field was renamed from payment_id to id. Payment processing succeeded, but the subscription renewal client still read payment_id and could not link the payment. Existing tests checked status and amount only.',
            'contract': 'create_payment must preserve the payment_id response field for existing subscription clients.',
            'source': 'Synthetic postmortem · INC-001',
            'cases': [{'name': 'Legacy renewal client receives payment_id', 'function': 'create_payment', 'args': [49], 'assertion': 'contains_key', 'expected': 'payment_id'}],
        },
    },
    {
        'id': 'retry-idempotency', 'title': 'The duplicate charge',
        'subtitle': 'A retry should never become a second payment.',
        'service': 'payments', 'function': 'process_events',
        'before': 'def process_events(events):\n    return list(dict.fromkeys(events))\n',
        'after': 'def process_events(events):\n    return list(events)\n',
        'fixed': 'def process_events(events):\n    seen = set()\n    return [event for event in events if not (event in seen or seen.add(event))]\n',
        'baseline_cases': [
            {'name': 'One event produces one charge', 'function': 'process_events', 'args': [['evt_1']], 'assertion': 'equals', 'expected': ['evt_1']},
            {'name': 'Distinct events are preserved', 'function': 'process_events', 'args': [['evt_1', 'evt_2']], 'assertion': 'length', 'expected': 2},
        ],
        'incident': {
            'title': 'Webhook retries created duplicate charges', 'service': 'payments',
            'feature': 'Webhook processing', 'function': 'process_events', 'severity': 'high',
            'summary': 'A webhook delivery was retried with the same event identifier. The processor charged twice because deduplication had been removed. Tests covered one event and distinct events, but no duplicate delivery.',
            'contract': 'Repeated event identifiers must be processed once, preserving the order of their first occurrence.',
            'source': 'Synthetic postmortem · INC-002',
            'cases': [{'name': 'A retried event produces only one charge', 'function': 'process_events', 'args': [['evt_1', 'evt_1', 'evt_2']], 'assertion': 'equals', 'expected': ['evt_1', 'evt_2']}],
        },
    },
    {
        'id': 'refund-rounding', 'title': 'The missing cent',
        'subtitle': 'Rounding rules are part of a payment contract.',
        'service': 'payments', 'function': 'refund_cents',
        'before': 'from decimal import Decimal, ROUND_HALF_UP\n\ndef refund_cents(amount):\n    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))\n',
        'after': 'def refund_cents(amount):\n    return int(float(amount) * 100)\n',
        'fixed': 'from decimal import Decimal, ROUND_HALF_UP\n\ndef refund_cents(amount):\n    cents = Decimal(str(amount)) * 100\n    return int(cents.quantize(Decimal("1"), rounding=ROUND_HALF_UP))\n',
        'baseline_cases': [
            {'name': 'Whole-dollar refund', 'function': 'refund_cents', 'args': ['10.00'], 'assertion': 'equals', 'expected': 1000},
            {'name': 'Zero refund', 'function': 'refund_cents', 'args': ['0'], 'assertion': 'equals', 'expected': 0},
        ],
        'incident': {
            'title': 'Fractional-cent refunds were truncated', 'service': 'payments',
            'feature': 'Customer refunds', 'function': 'refund_cents', 'severity': 'medium',
            'summary': 'The refund calculation converted decimal money to float and truncated fractional cents. A refund of 10.005 became 1000 cents instead of 1001. Tests only covered whole-dollar amounts.',
            'contract': 'Refunds must use decimal arithmetic and round half up to the nearest cent.',
            'source': 'Synthetic postmortem · INC-003',
            'cases': [{'name': 'Half-cent rounds up without float truncation', 'function': 'refund_cents', 'args': ['10.005'], 'assertion': 'equals', 'expected': 1001}],
        },
    },
]

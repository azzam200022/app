def push_batches(recipients, batch_size=100):
    """Return ordered, deduplicated recipient batches within the provider limit."""
    if batch_size < 1:
        raise ValueError("batch_size must be positive")

    unique_recipients = []
    seen = set()
    for recipient in recipients or []:
        if not isinstance(recipient, str):
            continue
        recipient = recipient.strip()
        if recipient and recipient not in seen:
            seen.add(recipient)
            unique_recipients.append(recipient)

    return [
        unique_recipients[start : start + batch_size]
        for start in range(0, len(unique_recipients), batch_size)
    ]

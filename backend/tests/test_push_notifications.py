from push_notifications import push_batches


def test_push_batches_split_and_keep_order_without_duplicates():
    recipients = ["customer-" + str(index) for index in range(205)]
    recipients.extend(["customer-0", "  ", None])

    batches = push_batches(recipients)

    assert [len(batch) for batch in batches] == [100, 100, 5]
    assert batches[0][0] == "customer-0"
    assert batches[-1][-1] == "customer-204"
    assert sum(map(len, batches)) == 205


def test_push_batches_handles_empty_recipients():
    assert push_batches([]) == []
    assert push_batches(None) == []


def test_push_batches_rejects_nonpositive_size():
    try:
        push_batches(["customer-1"], batch_size=0)
    except ValueError as exc:
        assert "positive" in str(exc)
    else:
        raise AssertionError("Expected a nonpositive batch size to fail")

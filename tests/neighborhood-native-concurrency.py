"""Native multi-session check. Only the explicitly named local synthetic DB is allowed.
Requires the synthetic neighborhood financial fixture; never accepts a hosted DSN.
"""
import os
import subprocess

psql = os.environ['APS_TEST_PSQL']
dsn = os.environ['APS_TEST_DSN']
assert dsn == 'host=/private/tmp/aps-isolated-restore port=55439 user=postgres dbname=aps_pr159_revision_fixture'
args = [psql, dsn, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1']
request = '22222222-2222-4222-8222-222222222222'
auth = "SET test.user_id='11111111-1111-4111-8111-111111111111'; SET test.admin='true';"

def run(sql, success=True):
    result = subprocess.run(args + ['-c', sql], capture_output=True, text=True, timeout=10)
    if success:
        assert result.returncode == 0, result.stderr
    return result

def holder(sql):
    p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    p.stdin.write('BEGIN; SET LOCAL statement_timeout=\'5s\';' + auth + sql + " SELECT 'LOCK_HELD';\n")
    p.stdin.flush()
    while True:
        line = p.stdout.readline()
        assert line, p.stderr.read()
        if line.strip() == 'LOCK_HELD':
            return p

def release(p):
    p.stdin.write('COMMIT;\n')
    p.stdin.close()
    assert p.wait(timeout=5) == 0, p.stderr.read()

p = holder(f"SELECT id FROM service_requests WHERE id='{request}' FOR UPDATE;")
try:
    for table in ['invoices', 'request_payments', 'refunds', 'invoice_items', 'quotes']:
        result = run("BEGIN; SET LOCAL lock_timeout='200ms';" +
                     f"INSERT INTO {table}(service_request_id) VALUES('{request}'); ROLLBACK;", False)
        assert result.returncode != 0 and 'lock timeout' in result.stderr, (table, result.stderr)
        print('CONCURRENT_INSERT_FENCED', table)
finally:
    release(p)

resolve = f"SELECT aps_resolve_pricing_adjustment('{request}',2,'Native concurrency reconciliation');"
p = holder(resolve)
try:
    result = run("SET lock_timeout='200ms';" + auth + resolve, False)
    assert result.returncode != 0 and 'lock timeout' in result.stderr, result.stderr
    print('CONCURRENT_RESOLVER_FENCED')
finally:
    release(p)
result = run(auth + resolve)
assert '"net_charges": 70' in result.stdout, result.stdout
count = run(f"SELECT count(*) FROM request_timeline_events WHERE service_request_id='{request}' AND event_type='pricing_adjustment_reconciled';").stdout.strip()
assert count == '1', count
print('RETRY_SUCCEEDED_WITH_ONE_AUDIT_EVENT')

# Paid service conversion: a competing operator cannot commit a stale preview,
# and an uncertain-response retry creates exactly one supplemental invoice.
import json
run(auth + f"UPDATE invoices SET balance_due=amount_due-amount_paid WHERE service_request_id='{request}'; UPDATE service_requests SET paid_amount=35 WHERE id='{request}';")
details = '{"number_of_signers":1,"number_of_notarizations":1}'
preview_sql = f"SELECT aps_convert_neighborhood_paid_service('{request}','ron',90,'{details}','Native paid conversion',true);"
preview = json.loads(run(auth + preview_sql).stdout.strip().splitlines()[-1])
operation = '88888888-8888-4888-8888-888888888888'
quote = "NULL" if preview['expected_quote'] is None else "'" + preview['expected_quote'] + "'"
convert = f"SELECT aps_convert_neighborhood_paid_service('{request}','ron',90,'{details}','Native paid conversion',false,{preview['revision']},{quote},'{preview['financial_version']}','{operation}');"
p = holder(convert)
try:
    result = run("SET lock_timeout='200ms';" + auth + convert, False)
    assert result.returncode != 0 and 'lock timeout' in result.stderr, result.stderr
    print('CONCURRENT_PAID_CONVERSION_FENCED')
finally:
    release(p)
retry = json.loads(run(auth + convert).stdout.strip().splitlines()[-1])
assert retry['duplicate'] is True and retry['additional_amount_due'] == 20, retry
assert run(f"SELECT count(*) FROM neighborhood_conversion_operations WHERE id='{operation}';").stdout.strip() == '1'
assert run(f"SELECT count(*) FROM invoices WHERE invoice_number='INV-CONV-{operation}';").stdout.strip() == '1'
assert run(f"SELECT balance_due FROM service_requests WHERE id='{request}';").stdout.strip() == '55'
print('PAID_CONVERSION_RETRY_ONE_ADJUSTMENT_BALANCE_55')

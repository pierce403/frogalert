.PHONY: test verify serve

test:
	cargo test --workspace
	node --test tests/*.test.mjs

verify:
	./scripts/verify

serve:
	./scripts/serve-site

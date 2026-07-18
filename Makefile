.PHONY: display-bringup-check firmware-check serve test verify

test:
	cargo test --workspace
	node --test tests/*.test.mjs

verify:
	./scripts/verify

firmware-check:
	./scripts/build-display-bringup HARDWARE_REV1 --check
	./scripts/build-count-firmware HARDWARE_REV1 --check

display-bringup-check:
	./scripts/build-display-bringup HARDWARE_REV1 --check

serve:
	./scripts/serve-site

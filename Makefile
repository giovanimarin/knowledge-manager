.PHONY: setup start stop status logs doctor smoke backup restore verify

setup start stop status logs doctor smoke:
	@bash scripts/local.sh $@

backup restore:
	@bash scripts/local.sh $@ "$(DIR)"

verify:
	pnpm install --frozen-lockfile
	pnpm verify

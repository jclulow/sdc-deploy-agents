
ROOT :=				$(PWD)

NODE_VERSION =			v0.10.40
NODE_BASE_URL =			http://nodejs.org/dist/$(NODE_VERSION)
NODE_TARBALL =			node-$(NODE_VERSION)-sunos-x86.tar.gz

NODE_EXEC =			$(PWD)/node/bin/node
NPM_EXEC =			$(NODE_EXEC) $(PWD)/node/bin/npm

TARBALL =			deploy_agents.tar.gz

LIB_FILES = \
	wrap.ksh

COMMANDS = \
	deploy_agents

TARBALL_FILES = \
	$(COMMANDS:%=bin/%) \
	$(COMMANDS:%=cmd/%.js) \
	$(LIB_FILES:%=lib/%) \
	node/bin/node \
	node_modules

.PHONY: world
world: npm-0-stamp

.PHONY: check
check:
	@jshint */*.js
	@jscs */*.js

.PHONY: tarball
tarball: $(TARBALL)

$(TARBALL): world | $(TARBALL_FILES)
	/usr/bin/tar cfz $@ $(TARBALL_FILES)

downloads proto:
	mkdir -p $@

downloads/$(NODE_TARBALL): downloads
	@echo "downloading node $(NODE_VERSION) ..."
	curl -f -kL -o $@ '$(NODE_BASE_URL)/$(NODE_TARBALL)'

node/bin/node: downloads/$(NODE_TARBALL)
	@echo "extracting node $(NODE_VERSION) ..."
	mkdir -p node/bin
	gtar -xz -C node --strip-components=1 -f downloads/$(NODE_TARBALL)
	touch $@

npm-0-stamp: node/bin/node
	rm -rf node_modules
	$(NPM_EXEC) install
	touch $@

.PHONY:
npm-add-dep:
	if [[ -z "$(DEP)" ]]; then \
		echo "specify DEP to install" >&2; \
		exit 1; \
	fi
	$(NPM_EXEC) install $(DEP) --save

.PHONY: clean
clean:
	rm -rf $(TARBALL) node

clobber: clean
	rm -rf node_modules downloads


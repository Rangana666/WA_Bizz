# WA Bizz — Developer Makefile
# Run `make help` to see all commands.

.PHONY: help up down restart logs \
        bot-logs dash-logs evo-logs fleet-logs \
        bot-shell db-shell redis-shell fleet-shell \
        restart-bot restart-dash restart-fleet \
        seed migrate db-reset \
        fleet-up fleet-down \
        build build-bot build-dash \
        test lint \
        backup status

COMPOSE      := docker compose -f docker-compose.dev.yml
FLEET_COMPOSE := docker compose -f fleet-manager/docker-compose.yml --project-directory fleet-manager

# ─── Colours ─────────────────────────────────────────────────────────────────
CYAN  := \033[0;36m
GREEN := \033[0;32m
BOLD  := \033[1m
NC    := \033[0m

help: ## Show this help
	@echo ""
	@echo "  $(BOLD)WA Bizz — Developer Commands$(NC)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(CYAN)%-20s$(NC) %s\n", $$1, $$2}'
	@echo ""

# ─── Bot stack ────────────────────────────────────────────────────────────────
up: ## Start all bot services (detached)
	$(COMPOSE) up -d
	@echo "  $(GREEN)✓$(NC) Bot stack running"
	@echo "  → Dashboard:  http://localhost:3000"
	@echo "  → Bot API:    http://localhost:4000/health"

down: ## Stop all bot services
	$(COMPOSE) down

restart: ## Restart all bot services
	$(COMPOSE) restart

build: ## Rebuild bot + dashboard images
	$(COMPOSE) build --no-cache bot dashboard

build-bot: ## Rebuild only the bot image
	$(COMPOSE) build --no-cache bot

build-dash: ## Rebuild only the dashboard image
	$(COMPOSE) build --no-cache dashboard

restart-bot: ## Restart only the bot container
	$(COMPOSE) restart bot
	@echo "  $(GREEN)✓$(NC) Bot restarted"

restart-dash: ## Restart only the dashboard container
	$(COMPOSE) restart dashboard

logs: ## Tail all container logs
	$(COMPOSE) logs -f

bot-logs: ## Tail bot container logs
	$(COMPOSE) logs -f bot

dash-logs: ## Tail dashboard container logs
	$(COMPOSE) logs -f dashboard

evo-logs: ## Tail Evolution API logs
	$(COMPOSE) logs -f evolution

# ─── Shells ───────────────────────────────────────────────────────────────────
bot-shell: ## Open a shell inside the bot container
	$(COMPOSE) exec bot sh

db-shell: ## Open psql inside the PostgreSQL container
	$(COMPOSE) exec postgres psql -U wabizz wabizz

redis-shell: ## Open redis-cli inside the Redis container
	@REDIS_PASS=$$(grep REDIS_PASSWORD .env | cut -d= -f2); \
	$(COMPOSE) exec redis redis-cli --no-auth-warning -a "$$REDIS_PASS"

# ─── Database ────────────────────────────────────────────────────────────────
migrate: ## Apply Phase 6 migration to the dev database
	$(COMPOSE) exec postgres psql -U wabizz wabizz \
		-f /docker-entrypoint-initdb.d/phase6.sql 2>/dev/null || \
	$(COMPOSE) exec -T postgres psql -U wabizz wabizz < postgres/phase6.sql

db-reset: ## ⚠ Drop and recreate the dev database (destroys all data)
	@read -p "  Reset database? This deletes all data [y/N]: " confirm; \
	[ "$$confirm" = "y" ] || exit 0; \
	$(COMPOSE) down -v; \
	$(COMPOSE) up -d postgres; \
	sleep 5; \
	$(COMPOSE) up -d

seed: ## Load sample products and business config into dev database
	@echo "  Seeding sample data..."
	@$(COMPOSE) exec -T postgres psql -U wabizz wabizz << 'SQL'
INSERT INTO business_config (business_name, owner_name, owner_phone, business_type,
  welcome_msg_en, welcome_msg_si, welcome_msg_ta)
VALUES ('Mala''s Fashion', 'Mala Perera', '+94771234567', 'clothing',
  'Welcome to Mala''s Fashion!', 'Mala''s Fashion වෙත සාදරයෙන් පිළිගනිමු!',
  'Mala''s Fashion க்கு வரவேற்கிறோம்!')
ON CONFLICT DO NOTHING;

INSERT INTO products (product_code, name_en, name_si, name_ta, price, category, has_colors, colors, has_sizes, sizes, stock)
VALUES
  ('SAREE-001', 'Red Silk Saree',   'රතු සිල්ක් සාරිය',  'சிவப்பு பட்டு சேலை',  450000, 'Sarees',  true, ARRAY['Red','Maroon','Pink'],   false, ARRAY[]::text[], 5),
  ('SAREE-002', 'Blue Silk Saree',  'නිල් සිල්ක් සාරිය', 'நீல பட்டு சேலை',       520000, 'Sarees',  true, ARRAY['Blue','Navy','Teal'],    false, ARRAY[]::text[], 3),
  ('DRESS-001', 'Floral Midi Dress', 'ෆ්ලෝරල් ඩ්‍රස්',   'பூஞ்சை மிடி டிரஸ்',   320000, 'Dresses', true, ARRAY['White','Yellow','Pink'], true, ARRAY['S','M','L','XL'], 8),
  ('TOP-001',   'Cotton Blouse',    'කොටන් බ්ලවුස්',    'பருத்தி ரவிக்கை',       180000, 'Tops',    true, ARRAY['White','Black','Blue'],  true, ARRAY['S','M','L','XL','XXL'], 12)
ON CONFLICT (product_code) DO NOTHING;
SQL
	@echo "  $(GREEN)✓$(NC) Sample data loaded"

status: ## Show running containers and their health
	@$(COMPOSE) ps
	@echo ""
	@echo "  Bot API health:"
	@curl -sf http://localhost:4000/health | python3 -m json.tool 2>/dev/null || echo "    Not responding"

backup: ## Trigger a manual backup of the dev database
	@echo "  Creating local backup..."
	@mkdir -p backups
	@$(COMPOSE) exec postgres pg_dump -U wabizz wabizz | gzip > backups/dev-backup-$$(date +%Y%m%d-%H%M%S).sql.gz
	@echo "  $(GREEN)✓$(NC) Backup saved to backups/"

lint: ## Lint bot source files
	$(COMPOSE) exec bot node --check src/index.js src/bot/router.js
	@echo "  $(GREEN)✓$(NC) No syntax errors"

# ─── Fleet Manager ───────────────────────────────────────────────────────────
fleet-up: ## Start Fleet Manager stack
	$(FLEET_COMPOSE) up -d
	@echo "  $(GREEN)✓$(NC) Fleet Manager running"
	@echo "  → API:  http://localhost:5000/health"
	@echo "  → UI:   http://localhost:5001"

fleet-down: ## Stop Fleet Manager stack
	$(FLEET_COMPOSE) down

fleet-logs: ## Tail Fleet Manager API logs
	$(FLEET_COMPOSE) logs -f api

fleet-shell: ## Open a shell inside the Fleet Manager API container
	$(FLEET_COMPOSE) exec api sh

fleet-db-shell: ## Open psql for the Fleet Manager database
	$(FLEET_COMPOSE) exec postgres psql -U fleet fleet

restart-fleet: ## Restart Fleet Manager API
	$(FLEET_COMPOSE) restart api
	@echo "  $(GREEN)✓$(NC) Fleet Manager restarted"

# ─── Dev convenience ─────────────────────────────────────────────────────────
dev: ## Start everything (bot stack + fleet manager)
	@$(MAKE) up
	@$(MAKE) fleet-up
	@echo ""
	@echo "  $(BOLD)Everything is running:$(NC)"
	@echo "  Dashboard:     http://localhost:3000  (dev@wabizz.lk / dev123456)"
	@echo "  Fleet Admin:   http://localhost:5001  (admin@wabizz.lk / admin123456)"
	@echo "  Bot API:       http://localhost:4000/health"
	@echo "  Fleet API:     http://localhost:5000/health"

dev-down: ## Stop everything
	@$(MAKE) down
	@$(MAKE) fleet-down

csv-template: ## Print a sample CSV template for product import
	@echo 'product_code,name_en,name_si,name_ta,price,category,stock,has_colors,colors,has_sizes,sizes,description_en'
	@echo 'SHIRT-001,White Cotton Shirt,සුදු කොටන් ශිර්ට්,,1500.00,Tops,10,true,White|Blue|Black,true,S|M|L|XL,Premium cotton shirt'
	@echo 'SAREE-003,Green Silk Saree,,,4200.00,Sarees,5,true,Green|Emerald,false,,Pure silk saree'

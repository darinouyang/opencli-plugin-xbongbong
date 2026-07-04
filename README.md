# opencli-plugin-xbongbong

[OpenCLI](https://github.com/jackwener/opencli) plugin for **销帮帮CRM** — turn your browser session into a full-featured CLI for CRM operations.

## Architecture

Uses **Strategy.INTERCEPT + hash-change** pattern: the plugin navigates the SPA via hash routing to trigger its own API calls, then captures responses through OpenCLI's interceptor mechanism. Write operations leverage the SPA's internal HTTP client (via Vuex `store.dispatch`) to bypass CORS restrictions that block CDP-injected XHR/fetch.

## Prerequisites

- [OpenCLI](https://github.com/jackwener/opencli) `>=1.8.0` with Browser Bridge enabled
- A valid 销帮帮CRM session in Chrome (login at `appwebfront.xbongbong.com`)

## Installation

```bash
# Clone to OpenCLI plugins directory
git clone https://github.com/darinouyang/opencli-plugin-xbongbong.git \
  ~/.opencli/plugins/opencli-plugin-xbongbong
```

## Commands

### Customer

| Command | Description |
|---------|-------------|
| `customer-list` | List customers with optional keyword search & pagination |
| `customer-create` | Create a new customer with name, phone, and optional fields |
| `customer-get` | Get customer detail by ID |
| `customer-update` | Update customer fields by ID |
| `customer-delete` | Delete a customer by ID |
| `customer-assign` | Assign customer to another user |
| `customer-transfer` | Transfer customer ownership |
| `customer-return-pool` | Return customer to public pool |
| `customer-export` | Export customer list to CSV/JSON |

### Sales

| Command | Description |
|---------|-------------|
| `opportunity-list` | List sales opportunities |
| `quotation-create` | Create a quotation for a customer |
| `contract-list` | List contracts |
| `contract-create` | Create a new contract |

### Products & Payments

| Command | Description |
|---------|-------------|
| `product-list` | List products |
| `product-create` | Create a new product |
| `payment-list` | List payment records |
| `payment-create` | Create a payment record |

### Other

| Command | Description |
|---------|-------------|
| `followup-create` | Create a follow-up record for a customer |
| `pool-list` | List public pool customers |
| `dashboard-summary` | Get CRM dashboard summary statistics |

## Usage Example

```bash
# List customers
opencli xbongbong customer-list

# Search by keyword
opencli xbongbong customer-list --keyword "张三"

# Create a customer
opencli xbongbong customer-create "新客户" --phone 13800138000

# Get customer detail
opencli xbongbong customer-get --id 28187959

# Create a follow-up
opencli xbongbong followup-create --customer_id 28187959 --content "电话沟通，客户有采购意向"
```

## Technical Notes

- **Session**: Uses `siteSession: 'persistent'` — all commands share the same browser tab
- **Auth**: Extracts `corpid`/`userId` from Vue2 Vuex store, localStorage, or cookies
- **Module Config**: Dynamically fetches `appId`/`menuId`/`formId` via `templateList` API (with hardcoded fallbacks for the customer module)
- **Write Path**: `callSpaFormAdd()` → `store.dispatch('formDataAdd')` → `FormDataEditDialog.getSavePromise()` → SPA's bundled HTTP client
- **Read Path**: `interceptViaHash()` → hash navigation with query params → interceptor captures SPA's API response

## License

MIT

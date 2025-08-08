### HubSpot Objects Tools Plan (No Aggregators)

- **Split by concern**
  - `search_hubspot_objects`: dedicated search tool across HubSpot objects
  - `hubspot_objects`: CRUD tool for get/create/update/delete

- **Initial scope**
  - Start with `deals` only; expand objects incrementally (contacts, companies, tickets, etc.)

- **Schemas**
  - `search_hubspot_objects` args:
    - `object`: "deals" (initially)
    - `filters?`: [{ propertyName, operator, value }]
    - `filterGroups?`: [{ filters: [...] }] (optional OR logic)
    - `select?`: string[]
    - `sorts?`: [{ propertyName, direction: "ASC"|"DESC" }]
    - `limit?`: number
    - `after?`: string
    - `includeArchived?`: boolean
  - `hubspot_objects` args:
    - `action`: "get"|"create"|"update"|"delete"
    - `object`: "deals" (initially)
    - `id?`: string (for get/update/delete)
    - `properties?`: Record<string, any> (for create/update)
    - `select?`: string[] (optional for get)

- **Endpoints**
  - Search: POST `/crm/v3/objects/{object}/search`
  - Get: GET `/crm/v3/objects/{object}/{id}` (supports `properties` query)
  - Create: POST `/crm/v3/objects/{object}` with `{ properties }`
  - Update: PATCH `/crm/v3/objects/{object}/{id}` with `{ properties }`
  - Delete: DELETE `/crm/v3/objects/{object}/{id}`

- **Error/Auth**
  - Reuse `createProviderTool` and `ProviderApiHelper` for consistent auth, retries, Sentry, and token-expiry handling.

- **Next steps**
  1. Implement deals support end-to-end (search and CRUD)
  2. Extend `object` enum and light test each object with curl before wiring
  3. Add optional associations support in CRUD once core paths are stable



# Assets/CMDB Migration Reference

Import ordering, schema sync, Data Manager, AQL/IQL, and other Assets-specific migration knowledge.


## Import Dependency Ordering

Assets objects reference other objects. If you import an object that references another object that doesn't exist yet, the reference fails silently (the attribute is empty). Import order matters.

**The rule:** Import referenced objects before the objects that reference them.

**Practical ordering for a typical IT Assets schema:**
- Locations (no dependencies)
- Departments (may reference Locations)
- People/Contacts (may reference Departments, Locations)
- Vendors (may reference People)
- Operating Systems, Software Products (no dependencies, or reference Vendors)
- Hardware Assets (reference Locations, Departments, People, Vendors, OS)
- Software Installations (reference Hardware Assets, Software Products)
- Services / Business Applications (reference Hardware Assets, People)

**Circular dependencies:** If Object Type A references Object Type B and B references A, use a two-pass import:
- Pass 1: Import all objects of both types with their non-circular attributes. Omit the circular reference attributes.
- Pass 2: Update the circular reference attributes now that all objects exist.

CMDB-Kit handles this automatically with its `--two-pass` flag.


## Schema Sync vs Data Sync

**Schema** = object types, attributes, reference types, icons, statuses. This is the structure.
**Data** = the actual objects (CIs, assets, people, locations). This is the content.

Always sync schema first, then data. On Cloud, schema creation requires:
- Object type name
- Icon ID (required — Cloud returns "Icon needs to be set" without it)
- Parent object type (if not top-level)
- Attributes with type, description, and configuration
- Reference types defined before reference attributes can use them

**Icon gotcha:** Cloud requires `iconId` when creating object types via API. The assigned icon may not render in the type tree (JSDCLOUD-11064), but omitting it fails the request. Use the Assets API to list available icons and pick a valid ID.


## AQL vs IQL

**AQL (Assets Query Language)** is the current name on Cloud. **IQL (Insight Query Language)** is the legacy DC name. The syntax is the same.

Key syntax rules:
- Attribute names use the display name in Title Case: `objectType = "Server"` not `objectType = "server"`
- String matching is case-sensitive for object Names: `Name = "Active"` ≠ `Name = "active"`
- Reference traversal uses dot notation: `"Runs On".Name = "prod-server-01"`
- IN operator for multi-value: `Status IN ("Active", "Pending")`
- LIKE for partial match: `Name LIKE "prod-%"`
- Empty check: `Name is EMPTY`, `Name is not EMPTY`

**Cloud-specific AQL notes:**
- Cloud AQL may have slight performance differences on large schemas (>50,000 objects)
- Cloud AQL runs against the Assets platform service, not the Jira database directly


## DC Importers vs Cloud Data Manager

**DC** has six built-in importers:
- CSV Import
- Database Import (JDBC)
- JSON Import
- LDAP Import
- Jira Users Import
- Object Schema Import (from another schema)

Each runs on a schedule or manually. Configuration is stored in the Assets app settings.

**Cloud** replaces these with **Data Manager** (Premium/Enterprise only):
- 5 object classes: Compute, Software, People, Network, Peripherals
- 15 to 79 attributes per class
- Adapters for various data sources (SCCM, Intune, ServiceNow, CSV, etc.)
- Reconciliation and deduplication built in
- Different conceptual model: Data Manager owns the "golden record" and pushes to Assets

**Migration impact:** DC import configurations do not transfer to Cloud. Every import must be reconfigured in Data Manager. If the client is on Cloud Standard (no Data Manager), imports must be scripted via the Assets REST API.


## Reference Types

Assets uses named reference types to describe relationships between objects:

- **Dependency** — "Depends on" / "Is depended on by"
- **Installed** — "Is installed on" / "Has installed"
- **Link** — generic association
- **Reference** — generic association (different from Link in some schemas)

Custom reference types can be created. When migrating, ensure the same reference types exist on the target before importing objects with reference attributes.

**Cloud limitation:** Cloud does not support object type-level permissions. All permissions are schema-level. If the source DC instance uses type-level permissions to restrict who can see certain CIs, this access model must be redesigned.


## Placeholder Syntax for References

When importing via CSV or API, reference attributes accept the object Name as the value. The referenced object must already exist (or be created in a prior import pass).

- Single reference: just the Name string — `"prod-server-01"`
- Multi-reference: pipe-delimited — `"prod-server-01|prod-server-02"`

If multiple objects share the same Name within an object type, the reference is ambiguous. Assets picks the first match. Ensure Name uniqueness within each object type.


## The Services Schema

Cloud has a special **Services** schema that is read-only and auto-populated from JSM Services (the service registry). You cannot import into it or modify it via the Assets API. If the source DC instance stores services as Assets objects, they need to be migrated to JSM Services (the service registry) and will then appear in the Services schema automatically.


## Schema Templates

Cloud offers schema templates (ITAM, People, Facilities) that create pre-populated schemas with object types and attributes. If you need a clean schema for custom import (via CMDB-Kit or scripts), choose **Empty schema** to avoid conflicts with template-generated types.

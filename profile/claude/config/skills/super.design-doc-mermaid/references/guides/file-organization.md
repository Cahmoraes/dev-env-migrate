# File Organization

Full directory layout of the `design-doc-mermaid` skill:

```
design-doc-mermaid/
├── SKILL.md                          # This file - Main orchestrator
│
├── references/                       # Reference materials
│   ├── mermaid-diagram-guide.md     # Legacy general Mermaid syntax guide
│   └── guides/                       # Specialized guides (load on-demand)
│       ├── diagrams/
│       │   ├── activity-diagrams.md      # Workflows, processes
│       │   ├── deployment-diagrams.md    # Infrastructure, cloud
│       │   ├── architecture-diagrams.md  # System architecture
│       │   └── sequence-diagrams.md      # API interactions
│       ├── code-to-diagram/
│       │   └── README.md                 # Master guide for code analysis
│       ├── unicode-symbols/
│       │   └── guide.md                  # Complete symbol reference
│       ├── resilient-workflow.md         # Full generation + error-recovery workflow
│       ├── decision-tree-examples.md     # Worked decision-tree examples
│       ├── file-organization.md          # This file
│       └── troubleshooting.md            # Common syntax errors & fixes
│
├── assets/                           # Design document templates
│   ├── architecture-design-template.md
│   ├── api-design-template.md
│   ├── feature-design-template.md
│   ├── database-design-template.md
│   └── system-design-template.md
│
├── scripts/                          # Python utilities
│   ├── extract_mermaid.py           # Extract & validate diagrams
│   ├── mermaid_to_image.py          # Convert to PNG/SVG
│   └── resilient_diagram.py         # Full workflow: generate, validate, recover
│
└── examples/                         # Language-specific patterns
    ├── spring-boot/                 # Spring Boot patterns
    ├── fastapi/                     # FastAPI patterns
    ├── react/                       # React patterns
    ├── python-etl/                  # Data pipeline patterns
    ├── node-webapp/                 # Express.js patterns
    └── java-webapp/                 # Traditional Java patterns
```

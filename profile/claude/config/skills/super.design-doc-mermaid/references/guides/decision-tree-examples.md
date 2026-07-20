# Decision Tree — Worked Examples

Illustrative walkthroughs of the Decision Tree (see `SKILL.md`, "Decision Tree"). Load this when you want a concrete example of how a request maps to a guide selection + diagram type. The decision criteria themselves live in the SKILL.md Decision Tree — these are just examples of applying them.

### Example 1: User Asks for Workflow Diagram

**Input:** "Show the checkout process workflow"

**Skill Decision Path:**
```
1. Analyze: workflow, process → ACTIVITY DIAGRAM
2. Load guide: guides/diagrams/activity-diagrams.md
3. Find pattern: E-commerce checkout (template exists in guide)
4. Generate using template + Unicode symbols
5. Output activity diagram with decision points
```

**Output:** Complete activity diagram with Unicode symbols for cart, payment, order states.

### Example 2: User Provides Spring Boot Code

**Input:** "Here's my Spring Boot controller, create diagrams"

**Skill Decision Path:**
```
1. Analyze: Spring Boot, code provided → CODE-TO-DIAGRAM + SPRING BOOT
2. Load guides:
   - examples/spring-boot/README.md
   - guides/diagrams/architecture-diagrams.md (for structure)
   - guides/diagrams/sequence-diagrams.md (for method calls)
   - guides/diagrams/activity-diagrams.md (for business logic)
3. Generate multiple diagrams:
   a. Architecture diagram from @RestController/@Service/@Repository annotations
   b. Sequence diagram from method call chain
   c. Activity diagram from business logic flow
4. Output all diagrams with explanations
```

**Output:** 3-4 diagrams showing different views of the Spring Boot application.

### Example 3: User Wants Infrastructure Documentation

**Input:** "Document my GCP Cloud Run deployment with AlloyDB"

**Skill Decision Path:**
```
1. Analyze: infrastructure, GCP, Cloud Run → DEPLOYMENT DIAGRAM
2. Load guides:
   - guides/diagrams/deployment-diagrams.md
   - examples/spring-boot/ or examples/fastapi/ (if code provided)
3. Check for IaC files (Pulumi, Terraform, docker-compose)
4. Generate deployment diagram with:
   - Cloud Run services with specs
   - VPC connector
   - AlloyDB cluster
   - Security (IAM, Secret Manager)
   - Monitoring
5. Apply Unicode symbols for clarity
6. Output with resource specifications
```

**Output:** Complete GCP deployment diagram with all resources labeled.

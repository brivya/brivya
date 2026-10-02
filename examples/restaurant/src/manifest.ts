export const restaurantManifestYaml = `apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent
metadata:
  id: amina-coffee
  name: Amina Coffee
  version: 0.1.0
identity:
  canonicalUrl: https://amina-coffee.agent.brivya.com
  domains:
    - amina-coffee.agent.brivya.com
discovery:
  public: true
  locales:
    - en
capabilities:
  - ref: menu.search
    version: 0.1.0
  - ref: availability.check
    version: 0.1.0
  - ref: reservation.create
    version: 0.1.0
  - ref: order.create
    version: 0.1.0
  - ref: payment.request
    version: 0.1.0
protocols:
  rest:
    enabled: true
    basePath: /v0alpha1
  mcp:
    enabled: true
    basePath: /mcp
security:
  defaultAuth: delegated
  audit: required
runtime:
  mode: stateful
`;

/**
 * The WebMCP tools this build ships, in one list the controller registers from
 * ([ADR-0054](../../../docs/adr/0054-webmcp-operation-transaction-and-security-contract.md) §1).
 *
 * A definition names an inventory row and supplies the two things the row does
 * not: the derived argument schema, and the handler that runs the operation.
 * Everything else about the tool — its name, its description, when it is
 * registered, what it may write — is the row's, so this list can never disagree
 * with the contract.
 *
 * The list is empty until an exposure leaf fills it. A build that ships no
 * definitions registers no tools: a supporting browser sees an empty GFX tool
 * set rather than verbs that resolve to nothing.
 */
import type { WebmcpToolDefinition } from './webmcp-tool-controller';

export const WEBMCP_TOOL_DEFINITIONS: readonly WebmcpToolDefinition[] = [];

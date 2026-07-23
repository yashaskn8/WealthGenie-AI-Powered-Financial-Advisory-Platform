/**
 * Explicit Conversation State Machine (Phase 3)
 * States: Idle | Clarification | Planning | ExecutingTools | ExplainingResults | ErrorRecovery | Fallback
 */
export const CONVERSATION_STATES = {
  IDLE: 'Idle',
  CLARIFICATION: 'Clarification',
  PLANNING: 'Planning',
  EXECUTING_TOOLS: 'ExecutingTools',
  EXPLAINING_RESULTS: 'ExplainingResults',
  ERROR_RECOVERY: 'ErrorRecovery',
  FALLBACK: 'Fallback',
};

export class ConversationStateMachine {
  /**
   * Evaluates input and current state to compute next state transition.
   *
   * @param {string} currentState
   * @param {object} event { userMessage, hasTools, toolResults, isFallback, isError }
   * @returns {{ nextState: string, transitionReason: string }}
   */
  static transition(currentState = CONVERSATION_STATES.IDLE, event = {}) {
    if (event.isFallback) {
      return { nextState: CONVERSATION_STATES.FALLBACK, transitionReason: 'Provider failure -> Degraded local fallback' };
    }

    if (event.isError) {
      return { nextState: CONVERSATION_STATES.ERROR_RECOVERY, transitionReason: 'Execution error detected -> Error recovery' };
    }

    if (event.hasTools) {
      return { nextState: CONVERSATION_STATES.EXECUTING_TOOLS, transitionReason: 'Tool requests detected -> Executing tools' };
    }

    if (event.toolResults && event.toolResults.length > 0) {
      return { nextState: CONVERSATION_STATES.EXPLAINING_RESULTS, transitionReason: 'Tool execution completed -> Explaining results' };
    }

    if (event.userMessage && event.userMessage.trim().length < 5) {
      return { nextState: CONVERSATION_STATES.CLARIFICATION, transitionReason: 'Short query -> Seeking clarification' };
    }

    return { nextState: CONVERSATION_STATES.PLANNING, transitionReason: 'Standard intent planning' };
  }
}

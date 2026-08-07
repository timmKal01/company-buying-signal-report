const PAID_ANALYTICS_TOOLS = new Set(['HubSpot Analytics', 'Segment', 'Mixpanel']);

/**
 * Rule-based, transparent scoring — no ML/AI involved, every point is traceable to a `reason`.
 */
export function computeSignal({ openRolesCount, notableRolesCount, techStack, hasContact }) {
    const reasons = [];
    let score = 0;

    if (openRolesCount >= 5) {
        score += 2;
        reasons.push(`${openRolesCount} open roles (actively scaling)`);
    } else if (openRolesCount >= 1) {
        score += 1;
        reasons.push(`${openRolesCount} open role(s)`);
    }

    if (notableRolesCount > 0) {
        score += 1;
        reasons.push(`${notableRolesCount} role(s) match notable keywords`);
    }

    const paidToolCount =
        techStack.ecommerce.length +
        techStack.payment.length +
        techStack.liveChat.length +
        techStack.analytics.filter((t) => PAID_ANALYTICS_TOOLS.has(t)).length;
    if (paidToolCount > 0) {
        score += 1;
        reasons.push('uses paid ecommerce/payment/chat/analytics tooling');
    }

    if (hasContact) {
        score += 1;
        reasons.push('public contact info found');
    }

    const strength = score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
    return { score, strength, reasons };
}

export function cleanDisplayNameSql(expression: string): string {
  return `
    CASE
      WHEN ${expression} IS NOT NULL
        AND TRIM(${expression}) <> ''
        AND TRIM(${expression}) NOT LIKE '%=%'
        AND TRIM(${expression}) NOT LIKE '%GIAB%'
        AND TRIM(${expression}) NOT LIKE '%@lid'
      THEN TRIM(${expression})
      ELSE NULL
    END
  `;
}

export function contactDisplayNameSingleSql(alias: string): string {
  return `
    COALESCE(
      ${cleanDisplayNameSql(`${alias}.full_name`)},
      ${cleanDisplayNameSql(`${alias}.business_name`)},
      ${cleanDisplayNameSql(`COALESCE(${alias}.first_name, '') || ' ' || COALESCE(${alias}.last_name, '')`)},
      ${cleanDisplayNameSql(`${alias}.first_name`)},
      ${cleanDisplayNameSql(`${alias}.username`)},
      ${cleanDisplayNameSql(`${alias}.phone`)}
    )
  `;
}

export function contactDisplayNameSql(alias: string, isSplit = true): string {
  if (!isSplit) {
    return contactDisplayNameSingleSql(alias);
  }
  return `
    COALESCE(
      ${contactDisplayNameSingleSql(`${alias}_jid`)},
      ${contactDisplayNameSingleSql(`${alias}_lid`)}
    )
  `;
}

export function contactLeftJoins(alias: string, jidExpression: string): string {
  return `
    LEFT JOIN contacts AS ${alias}_jid ON ${alias}_jid.jid = ${jidExpression}
    LEFT JOIN contacts AS ${alias}_lid ON ${alias}_lid.lid = ${jidExpression}
  `;
}

/**
 * The archive identifies one person two ways: a phone JID and an opaque `@lid`.
 * Both turn up as message senders in the same chat, so anything that groups by
 * `sender_jid` reports one person as two — a group leaderboard listed the same
 * contact twice, 865 messages and 77.
 *
 * The contacts table holds the pairing, so joining through it collapses both
 * spellings onto the phone JID. Requires `contactLeftJoins(alias, expression)`
 * on the same expression. Falls back to the raw value for people who are not in
 * contacts at all, which is the best that can be done for them.
 */
export function canonicalJidSql(alias: string, expression: string): string {
  return `COALESCE(${alias}_lid.jid, ${alias}_jid.jid, ${expression})`;
}

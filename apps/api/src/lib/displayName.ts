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

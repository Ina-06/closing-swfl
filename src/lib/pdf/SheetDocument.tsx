import {
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { CHECKS, STATION_CODE, stationDateLabel } from "@/lib/constants";
import type { Mark, SheetRow } from "@/lib/sheet";

/**
 * The paper sheet, reproduced.
 *
 * This is the artefact the whole app exists to produce: the thing that gets
 * photographed and posted to the group at the end of the night. It is not
 * trying to look like the app. It is trying to look like the grid Karim has
 * been drawing by hand, so nobody reading it has to learn anything.
 *
 * Landscape, because the six handover checks each need a column wide enough to
 * carry their own name — a sheet where you have to remember what the fourth
 * tick means is a sheet that gets read wrong at midnight.
 */

/** Column widths, in percent of the printable width. They sum to 100. */
const COLUMNS = {
  number: 4,
  name: 19,
  time: 7.5,
  van: 7,
  /** Six of these. 5.5% of the printable width is ~41pt, which fits "CHARGER". */
  check: 5.5,
  vanIssues: 29.5,
} as const;

const INK = "#101820";
const MUTED = "#5b6673";
const LINE = "#c9d1da";
const HEAD = "#eef1f6";
const YES = "#0b7a52";
const NO = "#c8153f";

const styles = StyleSheet.create({
  page: {
    paddingTop: 26,
    paddingBottom: 30,
    paddingHorizontal: 24,
    fontSize: 8,
    fontFamily: "Helvetica",
    color: INK,
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 10,
  },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", letterSpacing: 0.4 },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 3 },
  date: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  dateRow: { textAlign: "right" },

  table: { borderWidth: 0.7, borderColor: LINE },
  headRow: {
    flexDirection: "row",
    backgroundColor: HEAD,
    borderBottomWidth: 0.7,
    borderBottomColor: LINE,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
    minHeight: 15,
  },
  headCell: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.3,
    borderRightWidth: 0.5,
    borderRightColor: LINE,
  },
  /* The check headings are the longest words in the narrowest columns, so they
     give up the letter-spacing and half a point of size to stay on one line. */
  checkHead: { fontSize: 6.5, letterSpacing: 0, paddingHorizontal: 1 },
  cell: {
    paddingVertical: 3.5,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderRightColor: LINE,
  },
  centre: { textAlign: "center" },
  bold: { fontFamily: "Helvetica-Bold" },

  footer: {
    position: "absolute",
    bottom: 14,
    left: 24,
    right: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: MUTED,
  },
});

/**
 * One handover check.
 *
 * Drawn rather than typed. The standard PDF fonts have no tick or cross in
 * them, so a literal "✓" comes out as a blank box on some readers and nothing
 * at all on others — which on this sheet would read as "not checked".
 */
function CheckMark({ value }: { value: Mark }) {
  if (value === "") return <Text style={styles.centre}> </Text>;

  return (
    <Svg
      viewBox="0 0 10 10"
      style={{ width: 7, height: 7, marginLeft: "auto", marginRight: "auto" }}
    >
      {value === "yes" ? (
        <Path
          d="M1.2 5.2 L3.9 8 L8.8 1.8"
          stroke={YES}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      ) : (
        <Path
          d="M1.8 1.8 L8.2 8.2 M8.2 1.8 L1.8 8.2"
          stroke={NO}
          strokeWidth={1.7}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </Svg>
  );
}

function Head({
  label,
  width,
  centre,
  tight,
}: {
  label: string;
  width: number;
  centre?: boolean;
  tight?: boolean;
}) {
  return (
    <View
      style={[styles.headCell, tight ? styles.checkHead : {}, { width: `${width}%` }]}
    >
      <Text style={centre ? styles.centre : undefined}>{label}</Text>
    </View>
  );
}

export function SheetDocument({
  nightKey,
  managedBy,
  rows,
}: {
  nightKey: string;
  managedBy: string;
  rows: SheetRow[];
}) {
  const date = stationDateLabel(new Date(`${nightKey}T12:00:00Z`));

  return (
    <Document
      title={`Closing sheet ${nightKey}`}
      author={`Closing — ${STATION_CODE}`}
    >
      <Page size="A4" orientation="landscape" style={styles.page} wrap>
        <View style={styles.header} fixed>
          <View>
            <Text style={styles.title}>CLOSING SHEET</Text>
            <Text style={styles.subtitle}>
              {STATION_CODE} · {rows.length}{" "}
              {rows.length === 1 ? "driver" : "drivers"}
            </Text>
          </View>
          <View style={styles.dateRow}>
            <Text style={styles.date}>{date}</Text>
            <Text style={styles.subtitle}>Managed by {managedBy || "—"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          {/* Repeated at the top of every page, so a second page is still
              readable on its own in a photograph. */}
          <View style={styles.headRow} fixed>
            <Head label="#" width={COLUMNS.number} centre />
            <Head label="NAME" width={COLUMNS.name} />
            <Head label="TIME" width={COLUMNS.time} centre />
            <Head label="VAN" width={COLUMNS.van} centre />
            {CHECKS.map((check) => (
              <Head
                key={check.field}
                label={check.label.toUpperCase()}
                width={COLUMNS.check}
                centre
                tight
              />
            ))}
            <Head label="VAN ISSUES" width={COLUMNS.vanIssues} />
          </View>

          {rows.map((row) => (
            <View key={row.number} style={styles.row} wrap={false}>
              <View style={[styles.cell, { width: `${COLUMNS.number}%` }]}>
                <Text style={styles.centre}>{row.number}</Text>
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.name}%` }]}>
                <Text style={styles.bold}>{row.name}</Text>
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.time}%` }]}>
                <Text style={styles.centre}>{row.time}</Text>
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.van}%` }]}>
                <Text style={styles.centre}>{row.van}</Text>
              </View>
              {CHECKS.map((check) => (
                <View
                  key={check.field}
                  style={[styles.cell, { width: `${COLUMNS.check}%` }]}
                >
                  <CheckMark value={row.checks[check.field]} />
                </View>
              ))}
              <View style={[styles.cell, { width: `${COLUMNS.vanIssues}%` }]}>
                <Text>{row.vanIssues}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Closing — {STATION_CODE}</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}

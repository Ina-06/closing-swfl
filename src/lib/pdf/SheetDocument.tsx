import {
  Document,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { STATION_CODE, stationDateLabel } from "@/lib/constants";
import type { Mark, SheetRow } from "@/lib/sheet";

/**
 * The paper sheet, reproduced.
 *
 * This is the artefact the whole app exists to produce: the thing that gets
 * photographed and posted to the group at the end of the night. It is not
 * trying to look like the app. It is trying to look like the grid Karim has
 * been drawing by hand, so nobody reading it has to learn anything.
 *
 * Landscape, because eleven columns on a portrait page means either a name
 * column too narrow for a full name or a van issues column too narrow for a
 * sentence, and both of those are the point.
 */

/** Column widths, in percent of the printable width. They sum to 100. */
const COLUMNS = {
  number: 4,
  name: 17,
  time: 8,
  van: 7,
  check: 4,
  infractions: 14,
  returns: 4,
  rescues: 4,
  vanIssues: 30,
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
 * The three handover checks.
 *
 * Drawn rather than typed. The standard PDF fonts have no tick or cross in
 * them, so a literal "✓" comes out as a blank box on some readers and nothing
 * at all on others — which on this sheet would read as "not checked".
 */
function CheckMark({ value }: { value: Mark }) {
  if (value === "") return <Text style={styles.centre}> </Text>;

  return (
    <Svg viewBox="0 0 10 10" style={{ width: 7, height: 7, marginLeft: "auto", marginRight: "auto" }}>
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

function Head({ label, width, centre }: { label: string; width: number; centre?: boolean }) {
  return (
    <View style={[styles.headCell, { width: `${width}%` }]}>
      <Text style={centre ? styles.centre : undefined}>{label}</Text>
    </View>
  );
}

export function SheetDocument({
  nightKey,
  managedBy,
  shift,
  rows,
}: {
  nightKey: string;
  managedBy: string;
  /** Free text from the dispatcher, e.g. "Cycle 1". Omitted when blank. */
  shift: string;
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
              {STATION_CODE}
              {shift ? ` · ${shift}` : ""} · {rows.length}{" "}
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
            <Head label="CELL" width={COLUMNS.check} centre />
            <Head label="KEY" width={COLUMNS.check} centre />
            <Head label="FUEL" width={COLUMNS.check} centre />
            <Head label="INFRA" width={COLUMNS.infractions} />
            <Head label="RTR" width={COLUMNS.returns} centre />
            <Head label="RES" width={COLUMNS.rescues} centre />
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
              <View style={[styles.cell, { width: `${COLUMNS.check}%` }]}>
                <CheckMark value={row.cell} />
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.check}%` }]}>
                <CheckMark value={row.key} />
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.check}%` }]}>
                <CheckMark value={row.fuel} />
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.infractions}%` }]}>
                <Text>{row.infractions}</Text>
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.returns}%` }]}>
                <Text style={styles.centre}>{row.returns}</Text>
              </View>
              <View style={[styles.cell, { width: `${COLUMNS.rescues}%` }]}>
                <Text style={styles.centre}>{row.rescues}</Text>
              </View>
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

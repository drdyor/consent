import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditFilterControls, mergeAuditFilterState } from "../../client/src/components/AuditFilterControls";
import { buildAuditFilterInput } from "../../shared/auditFilters";

describe("AuditFilterControls", () => {
  it("renders every visible audit control and emits a complete filter input when the clinician updates the control state", () => {
    const empty = { recordId: "", actor: "", patient: "", procedure: "", product: "", practitioner: "", status: "" as const, dateFrom: "", dateTo: "" };
    const emitted = mergeAuditFilterState(empty, { recordId: "11", actor: "Dr Example", patient: "Patient", procedure: "Neuromodulator", product: "Product Example", practitioner: "Dr Example", status: "signed", dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    const html = renderToStaticMarkup(createElement(AuditFilterControls, { value: empty, onChange: () => undefined, records: [{ id: 11, label: "11 · Patient Example" }] }));
    ["All consent records", "Actor", "Patient surname", "Procedure", "Product", "Practitioner", "All signature statuses"].forEach(label => expect(html).toContain(label));
    expect(buildAuditFilterInput(emitted)).toMatchObject({ recordId: 11, actor: "Dr Example", patient: "Patient", procedure: "Neuromodulator", product: "Product Example", practitioner: "Dr Example", status: "signed" });
  });

  it("emits each control change into the complete audit filter state used by the protected query", () => {
    let current = { recordId: "", actor: "", patient: "", procedure: "", product: "", practitioner: "", status: "" as const, dateFrom: "", dateTo: "" };
    const render = () => AuditFilterControls({ value: current, onChange: next => { current = next; }, records: [{ id: 11, label: "11 · Patient Example" }] });
    const change = (matcher: (element: any) => boolean, value: string) => {
      const tree: any = render(); const child = tree.props.children.find((element: any) => matcher(element)); child.props.onChange({ target: { value } });
    };
    change((element: any) => element.props.children?.[0]?.props?.children === "All consent records", "11");
    change((element: any) => element.props.placeholder === "Actor", "Dr Example");
    change((element: any) => element.props.placeholder === "Patient surname", "Patient");
    change((element: any) => element.props.placeholder === "Procedure", "Neuromodulator");
    change((element: any) => element.props.placeholder === "Product", "Product Example");
    change((element: any) => element.props.placeholder === "Practitioner", "Dr Example");
    const tree: any = render(); const statusControl = tree.props.children.find((element: any) => element.props.children?.[0]?.props?.children === "All signature statuses"); statusControl.props.onChange({ target: { value: "signed" } });
    change((element: any) => element.props["aria-label"] === "Audit date from", "2026-08-01");
    change((element: any) => element.props["aria-label"] === "Audit date to", "2026-08-31");
    expect(buildAuditFilterInput(current)).toMatchObject({ recordId: 11, actor: "Dr Example", patient: "Patient", procedure: "Neuromodulator", product: "Product Example", practitioner: "Dr Example", status: "signed" });
  });
});

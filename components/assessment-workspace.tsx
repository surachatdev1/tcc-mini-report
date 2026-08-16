"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  agencyRespondentRoles,
  agencyTypes,
  getGradeLabel,
  getTopic,
  provinces,
  schoolRespondentRoles,
  schoolTopicsList,
  type AgencyType,
  type AudienceGroup,
  type Score,
  type TopicId,
} from "@/lib/assessment-data";
import { calculateScore, type Answer } from "@/lib/scoring";
import {
  assessmentRepository,
  type AssessmentRecord,
  type DraftPayload,
} from "@/lib/integrations/assessment-repository";
import { SchoolCombobox } from "@/components/school-combobox";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { ResultInsights } from "@/components/result-insights";

const steps = ["เลือกแบบประเมิน", "ตอบตามสภาพจริง", "ตรวจทาน", "ดูผลลัพธ์"];

function todayInThailand() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
}

export function AssessmentWorkspace() {
  const [view, setView] = useState<"assessment" | "manual">("assessment");
  const [step, setStep] = useState(0);
  const [audienceGroup, setAudienceGroup] = useState<AudienceGroup>("school");
  const [topicId, setTopicId] = useState<TopicId>("bus");
  const [agencyType, setAgencyType] = useState<AgencyType>("road-safety");
  const [institution, setInstitution] = useState("");
  const [province, setProvince] = useState("");
  const [assessorName, setAssessorName] = useState("");
  const [assessorPhone, setAssessorPhone] = useState("");
  const [respondentRole, setRespondentRole] = useState("");
  const [position, setPosition] = useState("");
  const [publicConsent, setPublicConsent] = useState(false);
  const [assessmentDate, setAssessmentDate] = useState(todayInThailand);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [saveState, setSaveState] = useState("ยังไม่ได้บันทึกร่าง");
  const [submitState, setSubmitState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState<AssessmentRecord | null>(null);
  const idempotencyKeyRef = useRef("");

  const topic = useMemo(() => getTopic(topicId, agencyType), [topicId, agencyType]);
  const summary = useMemo(() => calculateScore(answers, topic), [answers, topic]);
  const roleOptions = audienceGroup === "school" ? schoolRespondentRoles : agencyRespondentRoles;
  const profileComplete = Boolean(institution.trim() && province && assessorName.trim().length >= 2 && respondentRole && assessmentDate && publicConsent);
  const readyToReview = summary.complete;

  useEffect(() => {
    void assessmentRepository.loadDraft().then((draft) => {
      if (!draft) return;
      setInstitution(draft.institution);
      setProvince(draft.province);
      setAssessorName(draft.assessorName ?? "");
      setAssessorPhone(draft.assessorPhone ?? "");
      setRespondentRole(draft.respondentRole);
      setPosition(draft.position);
      setPublicConsent(draft.publicConsent);
      setAssessmentDate(draft.assessmentDate);
      setTopicId(draft.topicId);
      setAudienceGroup(draft.topicId === "agency" ? "agency" : "school");
      setAgencyType(draft.agencyType);
      setAnswers(draft.answers);
      setSaveState("กู้คืนร่างในเครื่องแล้ว");
    });
  }, []);

  function openView(next: typeof view) {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToStep(next: number) {
    setStep(next);
    requestAnimationFrame(() => document.querySelector(".workspace")?.scrollIntoView({ block: "start" }));
  }

  function resetAnswers() {
    setAnswers({});
    setSubmitted(null);
    setSaveState("มีการแก้ไขที่ยังไม่ได้บันทึก");
  }

  function changeAudience(next: AudienceGroup) {
    setAudienceGroup(next);
    setTopicId(next === "agency" ? "agency" : "bus");
    setInstitution("");
    setAssessorName("");
    setAssessorPhone("");
    setPosition("");
    setRespondentRole("");
    resetAnswers();
  }

  function changeProvince(next: string) {
    setProvince(next);
    // ชื่อสถานศึกษาขึ้นกับจังหวัด จึงต้องล้างค่าที่เลือกเดิมทุกครั้งที่เปลี่ยนจังหวัด
    setInstitution("");
  }

  function changeTopic(next: TopicId) {
    setTopicId(next);
    resetAnswers();
  }

  function changeAgency(next: AgencyType) {
    setAgencyType(next);
    resetAnswers();
  }

  function updateScore(id: string, score: Score) {
    setAnswers((current) => ({
      ...current,
      [id]: { score, explanation: current[id]?.explanation ?? "" },
    }));
    setSaveState("มีการแก้ไขที่ยังไม่ได้บันทึก");
  }

  function updateExplanation(id: string, explanation: string) {
    setAnswers((current) => ({
      ...current,
      [id]: { score: current[id]?.score, explanation: explanation.slice(0, 500) },
    }));
    setSaveState("มีการแก้ไขที่ยังไม่ได้บันทึก");
  }

  function draftPayload(): DraftPayload {
    return {
      institution,
      province,
      assessorName,
      assessorPhone,
      respondentRole,
      position,
      assessmentDate,
      topicId,
      agencyType,
      answers,
      publicConsent,
    };
  }

  async function saveDraft() {
    setSaveState("กำลังบันทึกร่าง…");
    await assessmentRepository.saveDraft(draftPayload());
    setSaveState("บันทึกร่างในเครื่องนี้แล้ว");
  }

  async function submitAssessment() {
    if (!readyToReview || submitState === "saving") return;
    setSubmitState("saving");
    setSubmitError("");
    try {
      // เก็บ key เดิมเมื่อผู้ใช้กดลองใหม่หลังเครือข่ายสะดุด เพื่อไม่สร้างผลซ้ำ
      idempotencyKeyRef.current ||= crypto.randomUUID();
      const result = await assessmentRepository.submit({
        ...draftPayload(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      setSubmitted(result);
      setSubmitState("done");
      goToStep(3);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "บันทึกผลไม่สำเร็จ");
      setSubmitState("error");
    }
  }

  function startNewAssessment() {
    setStep(0);
    resetAnswers();
    setSubmitState("idle");
    setSubmitError("");
    idempotencyKeyRef.current = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const sharedProps: ViewProps = {
    step,
    setStep: goToStep,
    audienceGroup,
    changeAudience,
    topic,
    topicId,
    agencyType,
    changeTopic,
    changeAgency,
    institution,
    setInstitution,
    province,
    setProvince: changeProvince,
    assessorName,
    setAssessorName,
    assessorPhone,
    setAssessorPhone,
    respondentRole,
    setRespondentRole,
    roleOptions,
    position,
    setPosition,
    publicConsent,
    setPublicConsent,
    assessmentDate,
    answers,
    updateScore,
    updateExplanation,
    summary,
    profileComplete,
    readyToReview,
    saveDraft,
    saveState,
    submitState,
    submitError,
    submitAssessment,
    submitted,
    onNewAssessment: startNewAssessment,
  };

  return (
    <>
      <a className="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a>
      <SiteHeader active="assessment" />
      <main className="page-shell" id="main-content">
        <div className="subnav" aria-label="ส่วนของหน้าแบบประเมิน">
          <button type="button" aria-current={view === "assessment" ? "page" : undefined} onClick={() => openView("assessment")}>แบบประเมิน</button>
          <button type="button" aria-current={view === "manual" ? "page" : undefined} onClick={() => openView("manual")}>วิธีใช้งาน</button>
        </div>
        {view === "manual" ? <Manual /> : <AssessmentView {...sharedProps} />}
      </main>
      <SiteFooter />
    </>
  );
}

type ViewProps = {
  step: number;
  setStep: (step: number) => void;
  audienceGroup: AudienceGroup;
  changeAudience: (group: AudienceGroup) => void;
  topic: ReturnType<typeof getTopic>;
  topicId: TopicId;
  agencyType: AgencyType;
  changeTopic: (id: TopicId) => void;
  changeAgency: (id: AgencyType) => void;
  institution: string;
  setInstitution: (value: string) => void;
  province: string;
  setProvince: (value: string) => void;
  assessorName: string;
  setAssessorName: (value: string) => void;
  assessorPhone: string;
  setAssessorPhone: (value: string) => void;
  respondentRole: string;
  setRespondentRole: (value: string) => void;
  roleOptions: string[];
  position: string;
  setPosition: (value: string) => void;
  publicConsent: boolean;
  setPublicConsent: (value: boolean) => void;
  assessmentDate: string;
  answers: Record<string, Answer>;
  updateScore: (id: string, score: Score) => void;
  updateExplanation: (id: string, text: string) => void;
  summary: ReturnType<typeof calculateScore>;
  profileComplete: boolean;
  readyToReview: boolean;
  saveDraft: () => void;
  saveState: string;
  submitState: string;
  submitError: string;
  submitAssessment: () => void;
  submitted: AssessmentRecord | null;
  onNewAssessment: () => void;
};

function AssessmentView(props: ViewProps) {
  const { step, setStep, topic, summary } = props;
  return (
    <>
      <section className="intro">
        <div className="intro-content">
          <p className="eyebrow">เครื่องมือประเมินตนเองตามสภาพจริง</p>
          <h1>ช่วยให้เห็นช่องว่างความเสี่ยง ก่อนนำไปวางแผนพัฒนา</h1>
          <p className="intro-copy">เลือกแบบที่เกี่ยวข้องเพียงหนึ่งเรื่องต่อครั้ง อ่านเกณฑ์แต่ละระดับ แล้วเลือกคำตอบที่ใกล้เคียงกับการดำเนินงานจริงมากที่สุด</p>
        </div>
        <figure className="hero-figure">
          <picture>
            <source srcSet="/images/tcc-safe-travel-hero.webp" type="image/webp" />
            <img src="/images/tcc-safe-travel-hero.webp" width="1672" height="941" alt="ครูและนักเรียนร่วมกันดูแลความปลอดภัยบริเวณหน้าโรงเรียน" sizes="(max-width: 1020px) 100vw, 42vw" fetchPriority="high" decoding="async" />
          </picture>
        </figure>
      </section>
      <section className="purpose-note">
        <span aria-hidden="true">●</span>
        <div>
          <strong>ประเมินเพื่อพัฒนา ไม่ใช่เพื่อตัดสินหรือตัดงบประมาณ</strong>
          <p>ผลประเมินช่วยสะท้อนข้อจำกัดของโรงเรียนและหน่วยงาน เพื่อจัดลำดับความเสี่ยงและสนับสนุนทรัพยากรได้ตรงจุด</p>
        </div>
      </section>
      <section className="intent-notice" aria-labelledby="intent-title">
        <div className="intent-heading">
          <p className="section-kicker">โปรดอ่านก่อนเริ่มประเมิน</p>
          <h2 id="intent-title">คำชี้แจงและเจตนารมณ์ในการใช้ข้อมูล</h2>
          <p>แบบประเมินตนเองนี้เป็นเครื่องมือสำรวจและยกระดับความปลอดภัยในการเดินทางของนักเรียน เพื่อให้สถานศึกษาและหน่วยงานใช้ทบทวนสถานการณ์จริงและค้นหาช่องว่างความเสี่ยงในพื้นที่ของตนเอง</p>
        </div>
        <div className="intent-grid">
          <div><strong>ตอบตามสภาพจริง</strong><span>เลือกหนึ่งแบบต่อครั้ง และเลือกระดับ 0–3 ที่ตรงกับการดำเนินงานมากที่สุด ข้อมูลประกอบเป็นทางเลือก</span></div>
          <div><strong>ใช้ข้อมูลเพื่อการพัฒนา</strong><span>ผลรวมใช้สะท้อนข้อจำกัดเชิงโครงสร้างและประกอบข้อเสนอเชิงนโยบาย เพื่อสนับสนุนทรัพยากรและแก้ไขความเสี่ยงอย่างตรงจุด</span></div>
          <div><strong>ไม่ใช้เพื่อลงโทษ</strong><span>ผลประเมินไม่ได้นำไปตัดสินสถานศึกษา บุคคล หรือตัดงบประมาณ และควรอ่านร่วมกับบริบทและข้อจำกัดของพื้นที่</span></div>
        </div>
        <p className="privacy-note"><strong>การใช้ข้อมูลส่วนบุคคล:</strong> ชื่อ ตำแหน่ง และข้อมูลติดต่อใช้เพื่ออ้างอิงและติดตามผลภายในโครงการ เฉพาะผู้ดูแลและเจ้าหน้าที่ที่ได้รับสิทธิ์รายบุคคลเท่านั้นที่เปิดดูหรือส่งออกได้ กรุณาไม่ระบุข้อมูลนักเรียนหรือข้อมูลส่วนบุคคลอื่นในคำอธิบาย</p>
      </section>
      <div className="workspace">
        <nav className="step-nav" aria-label="ขั้นตอนการประเมิน">
          <h2>ขั้นตอน</h2>
          {steps.map((label, index) => (
            <button
              className="step-button"
              type="button"
              key={label}
              aria-current={step === index ? "step" : undefined}
              disabled={(index > 1 && !props.readyToReview) || (index === 3 && !props.submitted)}
              onClick={() => setStep(index)}
            >
              <span className="step-number">{index + 1}</span>
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="content-grid">
          <div>
            {step === 0 && <ProfileStep {...props} />}
            {step === 1 && <QuestionsStep {...props} />}
            {step === 2 && <ReviewStep {...props} />}
            {step === 3 && <Result record={props.submitted} fallback={summary} topic={props.topic} answers={props.answers} assessorName={props.assessorName} province={props.province} onNewAssessment={props.onNewAssessment} />}
          </div>
          <aside className="summary-card" aria-label="สรุปความคืบหน้า">
            <h2>{step === 3 ? "ผลประเมิน" : "ความคืบหน้า"}</h2>
            <p className="summary-topic">{topic.label}</p>
            <p className="score-total">{step === 3 ? summary.percent.toFixed(0) : Math.round((summary.answered / topic.questions.length) * 100)}%</p>
            <p className="summary-muted">{step === 3 ? `ระดับ ${summary.grade}` : `ตอบแล้ว ${summary.answered} จาก ${topic.questions.length} ข้อ`}</p>
            <div
              className="progress-track"
              role="progressbar"
              aria-label="ความครบถ้วนของคำตอบ"
              aria-valuemin={0}
              aria-valuemax={topic.questions.length}
              aria-valuenow={summary.answered}
            ><div className="progress-fill" style={{ width: `${(summary.answered / topic.questions.length) * 100}%` }} /></div>
            <p className="summary-muted">{step === 3 ? "บันทึกผลเรียบร้อยแล้ว" : summary.complete ? "ตอบครบแล้ว พร้อมตรวจทาน" : "ตอบตามสภาพจริงให้ครบทุกข้อ"}</p>
            {step === 3 ? <ul className="summary-list">
              {summary.categories.map((category) => <li key={category.id}><span>{category.label}</span><strong>{category.percent.toFixed(0)}%</strong></li>)}
            </ul> : null}
          </aside>
        </div>
      </div>
    </>
  );
}

function ProfileStep(props: ViewProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="section-kicker">ขั้นตอนที่ 1 จาก 4</p>
        <h2>เลือกผู้ประเมินและแบบที่เกี่ยวข้อง</h2>
        <p>ระบบจะแสดงเฉพาะเกณฑ์ที่ตรงกับบทบาท ไม่จำเป็นต้องทำครบทุกแบบในครั้งเดียว</p>
      </div>
      <div className="audience-grid">
        <button type="button" className="audience-card" aria-pressed={props.audienceGroup === "school"} onClick={() => props.changeAudience("school")}>
          <span className="audience-icon" aria-hidden="true">01</span>
          <span><strong>โรงเรียน / สถานศึกษา</strong><small>ประเมินรถรับส่ง รถทัศนศึกษา หรือรถจักรยานยนต์</small></span>
        </button>
        <button type="button" className="audience-card" aria-pressed={props.audienceGroup === "agency"} onClick={() => props.changeAudience("agency")}>
          <span className="audience-icon" aria-hidden="true">02</span>
          <span><strong>หน่วยงานระดับพื้นที่</strong><small>ประเมินการดำเนินงานตามมติคณะรัฐมนตรี</small></span>
        </button>
      </div>

      {props.audienceGroup === "school" ? (
        <div className="topic-section">
          <p className="field-label">เลือกหนึ่งแบบที่เกี่ยวข้อง <span className="required-mark">*</span></p>
          <div className="topic-list">
            {schoolTopicsList.map((item) => (
              <button key={item.id} type="button" className="topic-button" aria-pressed={props.topicId === item.id} onClick={() => props.changeTopic(item.id)}>
                <strong>{item.label}</strong><small>{item.detail}</small><span>{item.questions.length} ประเด็น</span>
              </button>
            ))}
          </div>
          <p className="na-note"><strong>กรณีไม่เกี่ยวข้อง:</strong> ไม่ต้องเลือกแบบนั้น เช่น โรงเรียนไม่มีรถรับส่งนักเรียน ให้เลือกเฉพาะแบบที่สะท้อนสถานการณ์จริง</p>
        </div>
      ) : (
        <div className="field full agency-field">
          <label htmlFor="agency-type">ประเภทหน่วยงาน <span className="required-mark">*</span></label>
          <select id="agency-type" value={props.agencyType} onChange={(event) => props.changeAgency(event.target.value as AgencyType)}>
            {agencyTypes.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </div>
      )}

      <div className="profile-fields">
        <section className="profile-section" aria-labelledby="organization-fields-title">
          <div className="profile-section-heading">
            <span aria-hidden="true">1</span>
            <div><h3 id="organization-fields-title">ข้อมูลพื้นที่และหน่วยงาน</h3><p>เลือกจังหวัดก่อน แล้วจึงค้นหาสถานศึกษาหรือระบุชื่อหน่วยงาน</p></div>
          </div>
          <div className="profile-field-grid location-fields">
            <div className="field province-field">
              <label htmlFor="province">จังหวัด <span className="required-mark">*</span></label>
              <select id="province" value={props.province} onChange={(event) => props.setProvince(event.target.value)}>
                <option value="">เลือกจังหวัด</option>
                {provinces.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field institution-field">
              <label htmlFor="institution">{props.audienceGroup === "school" ? "ชื่อสถานศึกษา" : "ชื่อหน่วยงาน"} <span className="required-mark">*</span></label>
              {props.audienceGroup === "school" ? (
                <SchoolCombobox key={props.province} province={props.province} value={props.institution} onChange={props.setInstitution} />
              ) : (
                <input id="institution" value={props.institution} onChange={(event) => props.setInstitution(event.target.value)} placeholder="ระบุชื่อเต็มของหน่วยงาน" autoComplete="organization" />
              )}
            </div>
          </div>
        </section>

        <section className="profile-section" aria-labelledby="assessor-fields-title">
          <div className="profile-section-heading">
            <span aria-hidden="true">2</span>
            <div><h3 id="assessor-fields-title">ข้อมูลผู้ให้ข้อมูล</h3><p>ใช้สำหรับอ้างอิงและติดตามผลภายในโครงการ โดยจำกัดการเข้าถึงเฉพาะผู้ได้รับสิทธิ์</p></div>
          </div>
          <div className="profile-field-grid assessor-fields">
            <div className="field assessor-name-field">
              <label htmlFor="assessor-name">ชื่อ–นามสกุลผู้ประเมิน <span className="required-mark">*</span></label>
              <input id="assessor-name" value={props.assessorName} maxLength={120} onChange={(event) => props.setAssessorName(event.target.value)} placeholder="ระบุชื่อและนามสกุล" autoComplete="name" />
            </div>
            <div className="field role-field">
              <label htmlFor="role">บทบาทผู้ประเมิน <span className="required-mark">*</span></label>
              <select id="role" value={props.respondentRole} onChange={(event) => props.setRespondentRole(event.target.value)}>
                <option value="">เลือกบทบาท</option>
                {props.roleOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="field phone-field">
              <label htmlFor="assessor-phone">เบอร์โทรศัพท์ <span className="optional-mark">ไม่บังคับ</span></label>
              <input id="assessor-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} value={props.assessorPhone} onChange={(event) => props.setAssessorPhone(event.target.value)} placeholder="เช่น 08x-xxx-xxxx หรือเบอร์สำนักงาน" />
            </div>
            <div className="field position-field">
              <label htmlFor="position">ตำแหน่งหรือความเกี่ยวข้อง <span className="optional-mark">ไม่บังคับ</span></label>
              <input id="position" value={props.position} onChange={(event) => props.setPosition(event.target.value)} placeholder="เช่น หัวหน้างานกิจการนักเรียน" autoComplete="organization-title" />
            </div>
            <div className="field date-field">
              <label htmlFor="date">วันที่ประเมิน</label>
              <input id="date" type="date" value={props.assessmentDate} readOnly aria-readonly="true" />
              <span className="field-help">ระบบระบุให้อัตโนมัติ</span>
            </div>
          </div>
        </section>

        <label className="consent-box field full">
          <input type="checkbox" checked={props.publicConsent} onChange={(event) => props.setPublicConsent(event.target.checked)} />
          <span>
            <strong>รับทราบเจตนารมณ์และยินยอมให้นำข้อมูลสรุปไปใช้ใน Dashboard ของโครงการ <span className="required-mark">*</span></strong>
            <small>Dashboard แสดงผลประเมินแก่เจ้าหน้าที่ที่ได้รับอนุญาต ส่วนชื่อผู้ให้ข้อมูล ตำแหน่ง และเบอร์โทรศัพท์จะแสดงเฉพาะผู้ดูแลหรืออีเมลที่ได้รับสิทธิ์เป็นรายบุคคล และอาจรวมอยู่ในไฟล์รายละเอียดที่ส่งออก</small>
          </span>
        </label>
      </div>
      <div className="action-row single-action">
        <button className="btn btn-primary" type="button" disabled={!props.profileComplete} onClick={() => props.setStep(1)}>เริ่มทำแบบประเมิน</button>
      </div>
    </section>
  );
}

function QuestionsStep(props: ViewProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="section-kicker">ขั้นตอนที่ 2 จาก 4 · {props.topic.label}</p>
        <h2>เลือกระดับที่ตรงกับการดำเนินงานจริง</h2>
        <p>อ่านข้อความในแต่ละระดับก่อนเลือก หากมีข้อมูลประกอบสามารถอธิบายเพิ่มเติมได้ แต่ไม่บังคับกรอก</p>
      </div>
      <div className="score-legend" aria-label="ความหมายคะแนน">
        <span><b>0</b> ยังประเมินไม่ได้</span><span><b>1</b> ขั้นพื้นฐาน</span><span><b>2</b> ขั้นมาตรฐาน</span><span><b>3</b> ขั้นยกระดับ</span>
      </div>
      <div className="weight-strip">
        {props.topic.categories.map((category) => <span key={category.id}>{category.label} <strong>{category.weight}%</strong></span>)}
      </div>
      {props.topic.questions.map((question, index) => {
        const answer = props.answers[question.id];
        const category = props.topic.categories.find((item) => item.id === question.categoryId);
        const previousCategory = index > 0 ? props.topic.questions[index - 1].categoryId : null;
        return (
          <div key={question.id}>
            {previousCategory !== question.categoryId && (
              <div className="category-heading">
                <span>หมวด</span><h3>{category?.label}</h3><strong>น้ำหนัก {category?.weight}%</strong>
              </div>
            )}
            <article className="question-card">
              <p className="question-number">ข้อ {question.number} · ประเด็นที่ {index + 1} จาก {props.topic.questions.length}</p>
              <h3 className="question-title" id={`${question.id}-title`}>{question.title}</h3>
              <div className="evidence-note"><strong>ข้อมูลที่ควรตรวจดูก่อนตอบ</strong><span>{question.evidence}</span></div>
              <div className="score-group" role="radiogroup" aria-labelledby={`${question.id}-title`}>
                {question.options.map((option) => (
                  <button type="button" role="radio" aria-checked={answer?.score === option.value} className="score-option" key={option.value} onClick={() => props.updateScore(question.id, option.value)}>
                    <span className="score-value">{option.value}</span>
                    <span><strong>{option.label}</strong><br />{option.description}</span>
                  </button>
                ))}
              </div>
              <div className="explanation field">
                <div className="explanation-head">
                  <label htmlFor={`${question.id}-explanation`}>เหตุผลและข้อมูลประกอบ <span className="optional-mark">ไม่บังคับ</span></label>
                  <span className="character-count">{answer?.explanation.length ?? 0}/500</span>
                </div>
                <textarea id={`${question.id}-explanation`} value={answer?.explanation ?? ""} onChange={(event) => props.updateExplanation(question.id, event.target.value)} placeholder="ถ้ามี เช่น มีคำสั่งแต่งตั้งและทบทวนล่าสุดเดือน… / ยังไม่มีผู้รับผิดชอบ / เอกสารอยู่ระหว่างจัดทำ" />
              </div>
            </article>
          </div>
        );
      })}
      <div className="action-row">
        <div>
          <button className="btn btn-secondary" type="button" onClick={props.saveDraft}>บันทึกร่างในเครื่อง</button>
          <div className="save-state" aria-live="polite">{props.saveState}</div>
        </div>
        <button className="btn btn-primary" type="button" disabled={!props.readyToReview} onClick={() => props.setStep(2)}>ตรวจทานคำตอบ</button>
      </div>
    </section>
  );
}

function ReviewStep(props: ViewProps) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="section-kicker">ขั้นตอนที่ 3 จาก 4</p>
        <h2>ตรวจทานก่อนยืนยันผล</h2>
        <p>ระบบจะบันทึกคำตอบดิบแบบสร้างครั้งเดียว และ Dashboard จะคำนวณคะแนนใหม่จากเกณฑ์ในระบบทุกครั้ง</p>
      </div>
      <div className="review-context">
        <span><strong>หน่วยงาน</strong> {props.institution}</span><span><strong>จังหวัด</strong> {props.province}</span><span><strong>ผู้ประเมิน</strong> {props.assessorName}</span><span><strong>บทบาท</strong> {props.respondentRole}</span><span><strong>ประเภท</strong> {props.topic.label}</span>
      </div>
      <div className="review-list">
        {props.topic.questions.map((question) => (
          <div className="review-item" key={question.id}>
            <strong>ข้อ {question.number} · คะแนน {props.answers[question.id]?.score}</strong>
            <span>{question.title}</span>
            {props.answers[question.id]?.explanation ? <p>{props.answers[question.id].explanation}</p> : null}
          </div>
        ))}
      </div>
      {props.submitError && <div className="status-message error" role="alert">{props.submitError}</div>}
      <div className="action-row">
        <button className="btn btn-secondary" type="button" onClick={() => props.setStep(1)}>กลับไปแก้ไข</button>
        <button className="btn btn-primary" type="button" disabled={props.submitState === "saving"} onClick={props.submitAssessment}>{props.submitState === "saving" ? "กำลังบันทึก…" : "ยืนยันและบันทึกผล"}</button>
      </div>
    </section>
  );
}

function Result({ record, fallback, topic, answers, assessorName, province, onNewAssessment }: {
  record: AssessmentRecord | null;
  fallback: ReturnType<typeof calculateScore>;
  topic: ReturnType<typeof getTopic>;
  answers: Record<string, Answer>;
  assessorName: string;
  province: string;
  onNewAssessment: () => void;
}) {
  const grade = record?.grade ?? fallback.grade;
  const score = record?.score ?? fallback.percent;
  const categories = record?.categoryScores ?? fallback.categories;
  const questionResults = record?.questionResults ?? fallback.questionResults;
  const recommendations = record?.recommendations ?? fallback.recommendations;
  const improvementCount = questionResults.filter((item) => item.requiresImprovement).length;
  return (
    <section className="panel">
      <div className="panel-heading">
        <p className="section-kicker">ขั้นตอนที่ 4 จาก 4</p>
        <h2>{record ? "บันทึกผลสำเร็จ" : "ผลการประเมิน"}</h2>
        <p>{record ? `เลขอ้างอิง ${record.id.slice(0, 8).toUpperCase()} · ผู้ประเมิน ${record.assessorName}` : `ผู้ประเมิน ${assessorName} · ยังไม่ได้บันทึกเข้าฐานข้อมูล`}</p>
      </div>
      <div className="result-box"><p className="result-grade">{grade}</p><h3>{score.toFixed(1)}%</h3><p>{getGradeLabel(grade, record?.topicId ?? topic.id)}</p></div>
      <div className={`result-priority ${improvementCount ? "needs-improvement" : "meets-standard"}`}>
        <strong>{improvementCount ? `พบ ${improvementCount} ข้อที่ยังไม่ถึงขั้นมาตรฐาน` : "ทุกข้อถึงขั้นมาตรฐานหรือขั้นยกระดับ"}</strong>
        <span>{improvementCount ? "ระบบแสดงแนวทางปรับปรุงแยกใต้แต่ละข้อที่ได้ 0–1 คะแนน" : "ควรรักษามาตรการ ติดตามผล และเก็บข้อมูลอ้างอิงอย่างต่อเนื่อง"}</span>
      </div>
      <ResultInsights
        topicId={record?.topicId ?? topic.id}
        agencyType={record?.agencyType ?? (topic.id === "agency" ? "road-safety" : null)}
        province={record?.province ?? province}
        score={score}
        grade={grade}
        categories={categories}
        questionResults={questionResults}
        recommendations={recommendations}
      />
      <div className="formula-card">
        <h3>สูตรที่ใช้คำนวณ</h3>
        <p><strong>คะแนนหมวด</strong> = ผลรวมคะแนนในหมวด ÷ (จำนวนข้อในหมวด × 3) × 100</p>
        <p><strong>คะแนนรวม</strong> = ผลรวมของ (คะแนนหมวด × น้ำหนักหมวด ÷ 100)</p>
        <p><strong>การแปลผล</strong> A ตั้งแต่ 85% · B 70–84.99% · C 50–69.99% · D ต่ำกว่า 50%</p>
      </div>
      <section className="item-results" aria-labelledby="item-results-title">
        <div className="item-results-heading">
          <div><p className="section-kicker">ตรวจสอบย้อนกลับได้ทุกคำตอบ</p><h3 id="item-results-title">ผลประเมินและข้อเสนอแนะรายข้อ</h3></div>
          <span>คะแนนเต็มรายข้อ 3 คะแนน</span>
        </div>
        <div className="item-result-list">
          {questionResults.map((item) => (
            <article className={`item-result-card ${item.requiresImprovement ? "needs-improvement" : "meets-standard"}`} key={item.id}>
              <div className="item-result-top">
                <div>
                  <p>ข้อ {item.number} · {item.categoryLabel}</p>
                  <h4>{item.title}</h4>
                </div>
                <div className="item-score"><strong>{item.score ?? "—"}</strong><span>/ 3</span></div>
              </div>
              <div className="item-result-meta">
                <span><strong>ระดับที่เลือก:</strong> {item.level}</span>
                <span><strong>คะแนนรายข้อ:</strong> {item.scorePercent.toFixed(1)}%</span>
                <span><strong>ผลต่อคะแนนรวม:</strong> {item.contribution.toFixed(2)} จาก {item.maxContribution.toFixed(2)} คะแนน</span>
              </div>
              {item.selectedDescription && <p className="matched-criterion"><strong>เกณฑ์ที่ตรงกับคำตอบ:</strong> {item.selectedDescription}</p>}
              {answers[item.id]?.explanation && <p className="assessor-explanation"><strong>ข้อมูลประกอบจากผู้ประเมิน:</strong> {answers[item.id].explanation}</p>}
              {item.requiresImprovement && item.recommendation ? (
                <div className="item-recommendation"><strong>ข้อเสนอแนะในการปรับปรุง</strong><span>{item.recommendation}</span></div>
              ) : (
                <p className="item-status-ok">ถึงขั้นมาตรฐานแล้ว ควรรักษาการดำเนินงานและเก็บข้อมูลอ้างอิงให้ตรวจสอบได้อย่างต่อเนื่อง</p>
              )}
            </article>
          ))}
        </div>
      </section>
      <div className="result-disclaimer"><strong>หมายเหตุ</strong> ผลนี้ใช้เป็นข้อมูลเพื่อพัฒนาและป้องกันความเสี่ยง ไม่ใช่ผลตรวจลงโทษหรือตัดงบประมาณ</div>
      <div className="action-row"><button className="btn btn-secondary" type="button" onClick={() => window.print()}>พิมพ์สรุปผล</button><button className="btn btn-primary" type="button" onClick={onNewAssessment}>ประเมินเรื่องอื่นต่อ</button></div>
    </section>
  );
}

function Manual() {
  return (
    <section className="manual-shell">
      <div className="dashboard-head"><div><p className="section-kicker">วิธีใช้งานฉบับย่อ</p><h1>ทำตามสภาพจริง ใช้เวลาน้อย และนำผลไปพัฒนาได้</h1><p>เกณฑ์ในระบบถอดจากตารางร่างวันที่ 22 มิถุนายน 2569 โดยคงข้อความระดับ 1–3 น้ำหนัก และหลักฐานประกอบของแต่ละข้อ</p></div></div>
      <ol className="help-steps">
        <li><strong>เลือกกลุ่มผู้ประเมิน</strong><span>โรงเรียนทำ 3 แบบด้านการเดินทาง ส่วนหน่วยงานระดับพื้นที่ทำแบบตามมติคณะรัฐมนตรี</span></li>
        <li><strong>เลือกหนึ่งแบบต่อครั้ง</strong><span>ไม่ต้องทำทุกแบบ หากไม่มีรถรับส่งให้ข้าม และเลือกเฉพาะเรื่องที่เกี่ยวข้องจริง</span></li>
        <li><strong>ระบุชื่อผู้ประเมิน</strong><span>ชื่อใช้เพื่ออ้างอิงและติดตามผลภายในโครงการ โดยจะแสดงเฉพาะผู้ดูแลหรืออีเมลที่ได้รับสิทธิ์รายบุคคล</span></li>
        <li><strong>อ่านเกณฑ์ก่อนเลือก</strong><span>แต่ละข้อมีคำอธิบายขั้นพื้นฐาน มาตรฐาน และยกระดับเฉพาะของตัวเอง</span></li>
        <li><strong>คะแนน 0 ไม่ใช่ “ไม่เกี่ยวข้อง”</strong><span>คะแนน 0 ใช้เมื่อไม่มีข้อมูลหรือหลักฐานจนยังประเมินไม่ได้</span></li>
        <li><strong>ข้อมูลประกอบไม่บังคับ</strong><span>หากสะดวก ควรระบุเหตุผลสั้น ๆ จากการดำเนินงานจริง โดยเฉพาะคะแนน 0–1 เพื่อช่วยวางแผนแก้ไขภายหลัง</span></li>
        <li><strong>อ่านผลแยกรายข้อ</strong><span>ระบบแสดงระดับที่เลือก ผลต่อคะแนนรวม และข้อเสนอแนะเฉพาะข้อที่ได้ 0–1 ซึ่งยังไม่ถึงขั้นมาตรฐาน 2 คะแนน</span></li>
        <li><strong>ผลใช้เพื่อพัฒนา</strong><span>Dashboard สรุปคะแนน ช่องว่าง และแนวโน้ม โดยไม่ใช้ผลเพื่อตัดสินหรือตัดงบประมาณ</span></li>
      </ol>
      <div className="manual-grid manual-detail-grid">
        <article className="panel"><h2>4 ชุดประเมิน แต่คนละกลุ่มผู้ใช้</h2><p>รถรับส่ง รถทัศนศึกษา และรถจักรยานยนต์เป็นแบบสำหรับสถานศึกษา ส่วนบทการดำเนินงานตามมติคณะรัฐมนตรีแยกตาม ศปถ. เขตพื้นที่การศึกษา ขนส่งจังหวัด และ อปท.</p></article>
        <article className="panel"><h2>ข้อมูลประกอบเป็นทางเลือก</h2><p>ระบบแสดงรายการเอกสารหรือข้อมูลที่ควรตรวจดูก่อนตอบ แต่ไม่บังคับกรอกคำอธิบายหรืออัปโหลดไฟล์ ผู้ประเมินสามารถระบุข้อจำกัดเป็นข้อความสั้น ๆ ได้หากต้องการ</p></article>
        <article className="panel"><h2>ค้นหาสถานศึกษาตามจังหวัด</h2><p>เลือกจังหวัดก่อน แล้วค้นหาชื่อสถานศึกษาหรืออำเภอจากรายชื่อโรงเรียน สพฐ. และโรงเรียนเอกชนในระบบ หากชื่อเปลี่ยนหรือเป็นสังกัดอื่นสามารถกรอกชื่อเองได้</p></article>
        <article className="panel"><h2>การแปลผลและสูตร</h2><p>คะแนนหมวด = ผลรวมคะแนน ÷ (จำนวนข้อ × 3) × 100 แล้วคูณน้ำหนักหมวดเพื่อรวมผล A ตั้งแต่ 85%, B 70–84.99%, C 50–69.99% และ D ต่ำกว่า 50%</p></article>
        <article className="panel"><h2>เจตนารมณ์การใช้ผล</h2><p>ใช้ผลเพื่อสะท้อนสถานการณ์จริง ช่องว่างความเสี่ยง และข้อจำกัดที่เกินอำนาจของโรงเรียน เพื่อวางแผนพัฒนา สนับสนุนทรัพยากร และจัดทำข้อเสนอเชิงนโยบาย ไม่ใช้เพื่อลงโทษ ตัดสิน หรือตัดงบประมาณ</p></article>
        <article className="panel"><h2>การเก็บข้อมูล</h2><p>ร่างที่ยังไม่ยืนยันพักไว้ในเครื่อง ผลที่ยืนยันบันทึกในระบบ ชื่อและข้อมูลติดต่อจัดเก็บแยกจากผลประเมิน ผู้ดูแลและอีเมลที่ได้รับสิทธิ์รายบุคคลเท่านั้นจึงจะเปิดดูหรือส่งออกข้อมูลส่วนนี้ได้</p></article>
      </div>
    </section>
  );
}

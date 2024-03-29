import puppeteer from "puppeteer";
import fs from "node:fs/promises";
import ejs from "ejs";
import * as metaAPI from "../apis/meta.api.js";
import classifier from "../apis/openai.api.js";
import buttons from "../botconfig/buttons.js";
import intentList from "../botconfig/intent.js";
import { getObjectURL, getObject } from "../utils/aws.js";
import sequelize, {
  Department,
  Mentor,
  HOD,
  Section,
  Hostel,
  Query,
} from "../db/index.js";
import templates from "../botconfig/templates.js";

const WORKING_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export const processMessage = async (msgInfo, student) => {
  const { value, field } = msgInfo;

  if (field !== "messages") return res.sendStatus(403);

  if ("messages" in value) {
    const recipientNo = +value.contacts[0].wa_id;
    const messageType = value.messages[0].type;
    const messageId = value.messages[0].id;
    let button;
    switch (messageType) {
      case "interactive":
        button = value.messages[0].interactive.button_reply.id;
        await processButtonMessage(button, recipientNo, student);
        break;
      case "button":
        button = value.messages[0].button.text;
        await processButtonMessage(button, recipientNo, student);
        break;
      case "text":
        const message = value.messages[0].text.body;
        const keyword = await classifyMsg(message);
        await processTextMessage(keyword, recipientNo, student);
        break;
      default:
        console.log(
          `Only text messages are supported. Received ${messageType}.`
        );
        break;
    }
    return messageId;
  } else if ("statuses" in value) {
    const messageStatus = value.statuses[0].status;
    const recipientNo = value.statuses[0].recipient_id;
    console.log(messageStatus, recipientNo);
  } else {
    console.log(field);
    console.log(value);
  }
};

const processButtonMessage = async (button, recipientNo, student) => {
  if (button === buttons.hey) await sendHeyMessage(recipientNo);
  else if (button === buttons.help) await sendHelpMessage(recipientNo);
  else if (button === buttons.result) await sendResultMessage(recipientNo);
  else if (button === buttons.attendance)
    await sendAttendanceMessage(recipientNo);
  else if (button === buttons.attendanceToday)
    await getAttendance(recipientNo, student, "today");
  else if (button === buttons.attendanceOverall)
    await getAttendance(recipientNo, student, "overall");
  else if (button === buttons.resultLastSemester)
    await getResult(recipientNo, student, "last semester");
  else if (button === buttons.resultPreviousSemester)
    await getResult(recipientNo, student, "all semester");
  else if (button === buttons.moreOptions)
    await sendMoreOptionMessage(recipientNo);
  else if (button === buttons.contactMentor)
    await sendMentorContactMessage(recipientNo, student);
  else if (button === buttons.moreContacts)
    await sendMoreContactsMessage(recipientNo);
  else if (button === buttons.departmentContacts)
    await sendDepartmentContactMessage(recipientNo);
  else if (button === buttons.allDepartmentContacts)
    await sendAllDepartmentContactsMessage(recipientNo);
  else if (button === buttons.classSchedule)
    await sendClassScheduleMessage(recipientNo, student);
  else if (button === buttons.allOptions || button === buttons.moreExamples)
    await sendAllOptionsMessage(recipientNo);
  else if (button === buttons.usageExample || button === buttons.howToUse)
    await sendUsageExampleMessage(recipientNo);
  else if (button === buttons.anotherExample)
    await sendAnotherExampleMessage(recipientNo);
  else if (button === buttons.authoritiesContacts)
    await sendAuthoritiesContactMessage(recipientNo, student);
  else if (button === buttons.facultyContacts)
    await sendFacultyContactsMessage(recipientNo, student);
};

const classifyMsg = async (msgText) => {
  const { intent, logprobs } = await classifier(msgText);
  console.log(intent, logprobs, msgText);

  await Query.create({
    query: msgText,
    completion: intent.toString(),
  });

  if (logprobs < -0.05 && msgText !== "help") return null;

  return intentList[intent];
};

const processTextMessage = async (intent, recipientNo, student) => {
  if (intent === intentList[0]) {
    await sendHeyMessage(recipientNo);
  } else if (intent === intentList[1]) {
    await sendResultMessage(recipientNo);
  } else if (intent === intentList[2]) {
    await sendAttendanceMessage(recipientNo);
  } else if (intent === intentList[3]) {
    await sendDepartmentContactMessage(recipientNo);
  } else if (intent === intentList[4]) {
    await sendAuthoritiesContactMessage(recipientNo, student);
  } else if (intent === intentList[5]) {
    await sendClassScheduleMessage(recipientNo, student);
  } else if (intent === intentList[6]) {
    await sendHelpMessage(recipientNo);
  } else {
    await sendIntentNotRecognizedMessage(recipientNo);
  }
};

const sendHeyMessage = async (recipientNo) => {
  const text = `
Hey, there! 😃

Following are the most frequently asked questions. What would you like to know?`;

  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Attendance",
            title: "Show Attendance",
          },
        },
        {
          type: "reply",
          reply: {
            id: "Result",
            title: "Show Result",
          },
        },
        {
          type: "reply",
          reply: {
            id: "More options",
            title: "More options",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendResultMessage = async (recipientNo) => {
  const message = {
    type: "button",
    body: {
      text: "Do you want to see the result of the last semester or of all the semesters?",
    },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Last Semester Result",
            title: "Last Semester",
          },
        },
        {
          type: "reply",
          reply: {
            id: "All Semesters Result",
            title: "All Semesters",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendAttendanceMessage = async (recipientNo) => {
  const message = {
    type: "button",
    body: {
      text: "Do you want to see today's attendance or overall attendance?",
    },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Today's Attendance",
            title: "Today's Attendance",
          },
        },
        {
          type: "reply",
          reply: {
            id: "Overall Attendance",
            title: "Overall Attendance",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendHelpMessage = async (recipientNo) => {
  const text = `
*_What is Ayra?_*
I'm your assistant and my job is to keep you updated on your child's attendance, result, and much more. Click on 'Show All Options' to see all that you can ask me.

*_How to use Ayra?_*
It's easy! Whenever you have a question, just type and hit send. For example, write 'attendance' and I'll show your child's attendance.`;

  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Hey",
            title: "Send Hey",
          },
        },
        {
          type: "reply",
          reply: {
            id: "All options",
            title: "Show all options",
          },
        },
        {
          type: "reply",
          reply: {
            id: "Example",
            title: "Give an example",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendDepartmentContactMessage = async (recipientNo) => {
  const departments = await Department.findAll({
    attributes: ["name", "block", "contact"],
    limit: 3,
  });
  let text = `*_Following are the contact details of some commonly requested departments._*\n`;
  for (let department of departments) {
    text += `
${department.name}
Tel. No.: ${department.contact}\n`;
  }
  text += `\nIf you're looking for some other department, press on the below button to see contact details of all department.`;
  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "All Departments Contact",
            title: "Show all",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendAllDepartmentContactsMessage = async (recipientNo) => {
  const departments = await Department.findAll({
    attributes: ["name", "contact"],
    offset: 3,
  });
  let text = `_*Following are the contact details of all the rest departments.*_\n`;
  for (let department of departments) {
    text += `
Department Name: ${department.name}
Contact Number: ${department.contact}\n`;
  }
  const message = {
    body: text,
  };

  await metaAPI.sendMessage(recipientNo, message, "text");
};

const sendIntentNotRecognizedMessage = async (recipientNo) => {
  const text = `
I'm sorry! I was unable to understand your question. Can you please write it clearly?

If the problem persists, please contact us at +91 9999999999.`;

  const message = {
    body: text,
  };

  await metaAPI.sendMessage(recipientNo, message);
};

const sendClassScheduleMessage = async (recipientNo, student) => {
  const everydaySchedule = await sequelize.query(`
    SELECT 
      sub.subject_code,
      day,
      slot
    FROM student s
    JOIN lecture l ON s.section_id = l.section_id
    JOIN course_subject cs ON l.course_subject_id = cs.id
    JOIN subject sub ON sub.id = cs.subject_id
    JOIN hour_slot hs ON hs.id = l.hour_slot_id
    WHERE s.id=${student.id}
    ORDER BY day, hs.id;
  `);
  let text = `*_Sure, here's the schedule of classes for the ongoing semester._*`;
  let currentDay = 0;
  for (let schedule of everydaySchedule[0]) {
    if (currentDay != schedule.day) {
      text += `\n\n*Day: ${WORKING_DAYS[+schedule.day - 1]}*`;
      currentDay = schedule.day;
    }
    text += `\nSubject: ${schedule.subject_code.slice(0, 6)} - Timing: ${
      schedule.slot
    }`;
  }
  const message = {
    body: text,
  };

  await metaAPI.sendMessage(recipientNo, message, "text");
};

const sendMoreOptionMessage = async (recipientNo) => {
  const text = `Sure, here are some more options that you might find helpful`;
  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Class Schedule",
            title: "Show Class Schedule",
          },
        },
        {
          type: "reply",
          reply: {
            id: "Mentor Contact Number",
            title: "Contact Mentor",
          },
        },
        {
          type: "reply",
          reply: {
            id: "More Contact Numbers",
            title: "Show More Contacts",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendMentorContactMessage = async (recipientNo, student) => {
  const mentorDetails = await Mentor.findByPk(student.mentorId);
  const message = [
    {
      name: {
        formatted_name: `${mentorDetails.firstName} ${mentorDetails.lastName}`,
        first_name: mentorDetails.firstName,
        last_name: mentorDetails.lastName,
      },
      phones: [
        {
          phone: mentorDetails.contact,
          type: "Work",
        },
      ],
    },
  ];

  await metaAPI.sendMessage(recipientNo, message, "contacts");
};

const sendAllOptionsMessage = async (recipientNo) => {
  const text = `
*_Ayra can help you with following things:_*

1. Your ward's marks
    Example: show marks

2. Your ward's attendance
    Example: show attendance
   
3. Ward's class schedule
    Example: show time table

4. Contact number of different departments
    Example: contact number of fee/admission/dsr department
   
5. Contact number of teachers, mentors, and HOD
    Example: phone number of teachers/mentor/HOD`;

  const message = {
    body: text,
  };

  await metaAPI.sendMessage(recipientNo, message, "text");
};

const sendUsageExampleMessage = async (recipientNo) => {
  const text = `
*_Sure, let's start off with an easy example._*

Type 'Show time table' and hit enter. I'll show you the schedule of classes.`;

  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Another example",
            title: "Give another example",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendAnotherExampleMessage = async (recipientNo) => {
  const text = `
*_Sure, here's another example._*
  
Type 'Show attendance' and hit send. In return, I'll ask you whether you want to see today's attendance or overall attendance.`;

  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "More examples",
            title: "Show more examples",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendMoreContactsMessage = async (recipientNo) => {
  const text = `Sure! Would you like to receive the contact details of the authorities or a specific department?`;

  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Departments Contacts",
            title: "Departments Contacts",
          },
        },
        {
          type: "reply",
          reply: {
            id: "Authorities Contacts",
            title: "Authorities Contacts",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendAuthoritiesContactMessage = async (recipientNo, student) => {
  const mentor = await Mentor.findByPk(student.mentorId, {
    attributes: ["firstName", "middleName", "lastName", "contact"],
  });
  const section = await Section.findByPk(student.sectionId, {
    attributes: ["hodId"],
  });
  const hod = await HOD.findByPk(section.hodId, {
    attributes: ["firstName", "middleName", "lastName", "contact"],
  });
  const hostel = await Hostel.findByPk(student.hostelId, {
    attributes: ["warden", "contact"],
  });

  const text = `
_*Sure, here are the contact number of authorities you can reach out to.*_

Mentor's Name:  ${mentor.firstName} ${mentor.lastName}
Contact: ${mentor.contact}

Hostel Warden Name: ${hostel.warden}
Contact: ${hostel.contact}

HOD Name: ${hod.firstName} ${hod.lastName}
Contact: ${hod.contact}

If you want to see contact details of your ward's faculty, click on the button below.`;

  const message = {
    type: "button",
    body: { text },
    action: {
      buttons: [
        {
          type: "reply",
          reply: {
            id: "Faculty Contacts",
            title: "See Faculty Contacts",
          },
        },
      ],
    },
  };

  await metaAPI.sendMessage(recipientNo, message, "interactive");
};

const sendFacultyContactsMessage = async (recipientNo, student) => {
  const faculties = await sequelize.query(`
    SELECT 
      DISTINCT subject_code,
      f.first_name,
      f.middle_name,
      f.last_name,
      f.contact
    FROM student s
    JOIN lecture l ON l.section_id = s.section_id
    JOIN course_subject cs ON l.course_subject_id = cs.id
    JOIN subject sub ON sub.id = cs.subject_id
    JOIN faculty f ON l.faculty_id = f.id
    WHERE s.id=${student.id};
  `);
  let text = `_*Sure, here's the subject-wise faculty for this semester.*_`;
  for (let faculty of faculties[0]) {
    text += `\n
Faculty Name: ${faculty.first_name} ${faculty.last_name}
Subject Code: ${faculty.subject_code.slice(0, 6)}
Contact: ${faculty.contact}`;
  }
  const message = {
    body: text,
  };
  await metaAPI.sendMessage(recipientNo, message, "text");
};

const getAttendance = async (recipientNo, student, attendanceType) => {
  let uri = `${process.env.API_URI}/webhook/getAttendanceImage?id=${student.id}&attendanceType=${attendanceType}`;
  const message = {
    link: uri,
  };
  await metaAPI.sendMessage(recipientNo, message, "image");
};

const getResult = async (recipientNo, student, resultType) => {
  let fileName;
  switch (resultType) {
    case "last semester":
      fileName = `Last Semester Result ${student.registrationNo}.pdf`;
      break;
    case "all semester":
      fileName = `All Semester Result ${student.registrationNo}.pdf`;
      break;
  }
  const url = await getObjectURL("result", fileName);
  const message = [
    {
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: url,
            filename: fileName,
          },
        },
      ],
    },
    {
      type: "body",
      parameters: [
        {
          type: "text",
          text: student.fatherName,
        },
        {
          type: "text",
          text: student.semester,
        },
      ],
    },
  ];

  await metaAPI.sendTemplate(
    recipientNo,
    templates.resultDeclare.name,
    message
  );
};

const generateAttendanceImage = async (studentData, attendanceType) => {
  const lpuLogoImg = (
    await fs.readFile(
      "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/api/media/bot-assets/Bot Profile Picture.png"
    )
  ).toString("base64");
  const presentImg = (
    await fs.readFile(
      "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/api/media/misc/present.png"
    )
  ).toString("base64");
  const waitingImg = (
    await fs.readFile(
      "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/api/media/misc/waiting.png"
    )
  ).toString("base64");
  const absentImg = (
    await fs.readFile(
      "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/api/media/misc/absent.png"
    )
  ).toString("base64");
  const studentProfileImg = await getObject(
    "profile-image",
    `${studentData.registrationNo}.png`
  );

  const html = await ejs.renderFile(
    "/media/suyash/HDD/realwork/lpu-bot-prototype/packages/api/static/template/attendance.ejs",
    {
      pageAssets: {
        lpuLogoImg,
        studentProfileImg,
        presentImg,
        waitingImg,
        absentImg,
      },
      attendanceType,
      ...studentData,
    }
  );

  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.emulateMediaType("screen");
  await page.setViewport({ width: 1920, height: 2080 });
  const imageBuffer = await page.screenshot({
    omitBackground: false,
  });
  await browser.close();
  return imageBuffer;
};

// Webhook
// Serve attendance images when requested from Meta
export const getAttendanceImage = async (studentId, attendanceType) => {
  const [student] = await sequelize.query(`
    SELECT 
      registration_no,
      first_name,
      middle_name,
      last_name,
      course_code,
      semester
    FROM student s
    LEFT JOIN course c
      ON c.id = s.course_id
    WHERE s.id=${studentId};
  `);
  const studentData = {
    registrationNo: student[0].registration_no,
    name: `${student[0].first_name} ${student[0].middle_name || ""} ${
      student[0].last_name
    }`,
    courseCode: student[0].course_code,
  };

  // Show today's attendance differently on each day
  // Day 0 and 6 represents Sunday and Saturday respectively
  // So, for those days, attendance of day = 5(Friday) is shown
  let currentDate = new Date(Date.now());
  let day = currentDate.getDay();
  if (day == 0 || day == 6) day = 5;

  switch (attendanceType) {
    case "today":
      // Fetches the today's attendance in the lectures commenced today
      const [todaysAttendance] = await sequelize.query(`
        SELECT 
          sub.subject_code,
          a.status,
          hs.slot,
          date
        FROM student s
        JOIN attendance a ON a.student_id = s.id
        JOIN lecture l ON l.id = a.lecture_id
        JOIN course_subject cs ON cs.id = l.course_subject_id
        JOIN subject sub ON sub.id = cs.subject_id
        JOIN hour_slot hs ON hs.id = l.hour_slot_id
        WHERE s.id=${studentId} AND day='${day.toString()}'
        ORDER BY hs.id;
      `);
      studentData.attendance = todaysAttendance;
      break;
    case "overall":
      // Fetches the overall attendance in all subject of the current semester
      const [overallAttendance] = await sequelize.query(`
        SELECT 
          subject_code,
          attendance
        FROM student s
        JOIN overall_attendance oa ON oa.student_id = s.id
        JOIN course_subject cs ON cs.id = oa.course_subject_id
        JOIN subject sub ON sub.id = cs.subject_id
        WHERE s.id=${studentId};
      `);
      studentData.attendance = overallAttendance;
      break;
  }
  const imageBuffer = await generateAttendanceImage(
    studentData,
    attendanceType
  );
  return imageBuffer;
};

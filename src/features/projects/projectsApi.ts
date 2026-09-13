import { commands } from "../../bindings";
export const projectsApi = {
  list: commands.projectList,
  openDialog: commands.projectOpenDialog,
  close: commands.projectClose,
  reveal: commands.projectReveal,
  copyPath: commands.projectCopyPath,
};

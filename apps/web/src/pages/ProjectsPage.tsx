import { useState } from 'react';
import { Link } from 'react-router';
import { useCreateProject, useProjects } from '../api/queries.js';
import { LoadError } from '../components/LoadError.js';
import { ProjectForm } from '../components/ProjectForm.js';

export function ProjectsPage() {
  const projects = useProjects();
  const create = useCreateProject();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <h1>Projects</h1>
      {creating ? (
        <ProjectForm
          onSubmit={async (input) => {
            await create.mutateAsync(input as Parameters<typeof create.mutateAsync>[0]);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          New project
        </button>
      )}
      {projects.isPending && <p>Loading…</p>}
      {projects.isError && <LoadError error={projects.error} onRetry={() => void projects.refetch()} />}
      {projects.data && projects.data.length === 0 && <p>No projects yet.</p>}
      {projects.data && projects.data.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Description</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {projects.data.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link to={`/projects/${project.id}`}>{project.name}</Link>
                  </td>
                  <td>{project.description}</td>
                  <td>{new Date(project.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
